import type { MediaSessionHandle, TelephonyWebhookRequest, VerifiedWebhookEvent } from "./types";

export interface TelephonyProvider {
  readonly providerName: string;
  /** A5.1: signature, 300s replay window, and single-use nonce all verified here before any call record is created. */
  verifyWebhook(request: TelephonyWebhookRequest): Promise<VerifiedWebhookEvent>;
  openMediaSession(callReference: string): Promise<MediaSessionHandle>;
  transferCall(callReference: string, targetE164: string): Promise<void>;
  endCall(callReference: string): Promise<void>;
}
