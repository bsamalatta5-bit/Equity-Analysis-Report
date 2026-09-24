import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { z } from "zod";
import type { HumanPrincipal } from "@voice-receptionist/shared";
import { THRESHOLDS } from "@voice-receptionist/shared";
import { REDIS_CLIENT } from "../common/redis/redis.module";
import type { SessionValidator } from "../common/context/session-validator";

const sessionPayloadSchema = z.object({
  kind: z.literal("human_user"),
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: z.enum(["tenant_owner", "location_manager", "front_desk_user", "platform_operator"]),
  assignedLocationIds: z.array(z.string().uuid()),
});

function sessionKey(token: string): string {
  return `session:${token}`;
}

/** A3.2/A3.3: opaque session tokens (not JWTs) backed by Redis, 15-minute TTL. */
@Injectable()
export class SessionService implements SessionValidator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async issue(principal: Omit<HumanPrincipal, "kind">): Promise<string> {
    const token = randomBytes(32).toString("hex");
    const payload: HumanPrincipal = { kind: "human_user", ...principal };
    await this.redis.set(
      sessionKey(token),
      JSON.stringify(payload),
      "EX",
      THRESHOLDS.ACCESS_TOKEN_TTL_SECONDS,
    );
    return token;
  }

  async validateSessionToken(sessionToken: string): Promise<HumanPrincipal | null> {
    const raw = await this.redis.get(sessionKey(sessionToken));
    if (!raw) {
      return null;
    }
    const parsed = sessionPayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  }

  async revoke(sessionToken: string): Promise<void> {
    await this.redis.del(sessionKey(sessionToken));
  }
}
