import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import { NotFoundError } from "@voice-receptionist/shared";
import { resolveTenantForPhoneNumber, withTenant } from "../common/prisma-client";
import type { TelephonyProvider } from "../providers/telephony.provider";
import type { TelephonyWebhookRequest } from "../providers/types";
import type { CallSessionStore } from "../session/call-session-store";
import type { TelephonyWebhookRateLimiter } from "./webhook-rate-limit";

export interface WebhookHandlerResult {
  readonly callId: string;
}

/**
 * Module 5 core: verifies the webhook (A5.1), resolves the tenant from
 * the called number only (A3.8), and — before any assistant utterance —
 * creates the Call and ConsentRecord rows (A5.3), then initializes
 * Redis-backed session state (A5.5). A verification failure never reaches
 * this far: verifyWebhook throws before any of the above runs, so an
 * unauthenticated or replayed webhook creates no call record.
 */
export class TelephonyWebhookHandler {
  constructor(
    private readonly telephonyProvider: TelephonyProvider,
    private readonly prisma: PrismaClient,
    private readonly sessionStore: CallSessionStore,
    private readonly rateLimiter: TelephonyWebhookRateLimiter,
    private readonly logger: Logger,
  ) {}

  async handle(request: TelephonyWebhookRequest, sourceAddress: string): Promise<WebhookHandlerResult> {
    await this.rateLimiter.checkSourceAddress(sourceAddress);

    const event = await this.telephonyProvider.verifyWebhook(request);

    if (event.eventType === "call-end") {
      return this.handleCallEnd(event.callReference);
    }

    await this.rateLimiter.checkCallStartForNumber(event.toE164);
    return this.handleCallStart(event.callReference, event.fromE164, event.toE164);
  }

  private async handleCallStart(
    callReference: string,
    fromE164: string,
    toE164: string,
  ): Promise<WebhookHandlerResult> {
    const resolved = await resolveTenantForPhoneNumber(this.prisma, toE164);
    if (!resolved) {
      throw new NotFoundError("PhoneNumber", toE164);
    }

    const callId = await withTenant(this.prisma, resolved.tenantId, async (tx) => {
      const call = await tx.call.create({
        data: {
          tenantId: resolved.tenantId,
          locationId: resolved.locationId,
          direction: "inbound",
          startedAt: new Date(),
        },
      });
      // A5.3: the consent record exists before the first assistant
      // utterance. announcementPlayedAt stays null until the dialogue
      // flow (Module 7, not built this session) actually plays it.
      await tx.consentRecord.create({
        data: { callId: call.id, recordingConsented: false },
      });
      return call.id;
    });

    await this.sessionStore.create(callReference, {
      callId,
      tenantId: resolved.tenantId,
      locationId: resolved.locationId,
      contactPhoneE164: fromE164,
      turnSequence: 0,
      detectedLanguage: null,
    });

    this.logger.info({ callId, tenantId: resolved.tenantId }, "Call started");
    return { callId };
  }

  private async handleCallEnd(callReference: string): Promise<WebhookHandlerResult> {
    const session = await this.sessionStore.get(callReference);
    if (!session) {
      throw new NotFoundError("CallSession", callReference);
    }

    await withTenant(this.prisma, session.tenantId, (tx) =>
      tx.call.update({ where: { id: session.callId }, data: { endedAt: new Date() } }),
    );
    await this.sessionStore.delete(callReference);

    this.logger.info({ callId: session.callId }, "Call ended");
    return { callId: session.callId };
  }
}
