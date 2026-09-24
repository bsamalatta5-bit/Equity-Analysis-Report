import type { ActorPrincipalType, UserRole } from "../constants/enums";

/** A human dashboard user, resolved from a validated session. */
export interface HumanPrincipal {
  readonly kind: "human_user";
  readonly userId: string;
  readonly tenantId: string;
  readonly role: UserRole;
  readonly assignedLocationIds: readonly string[];
}

/** The voice gateway service, authenticated via mTLS plus a service-scoped token (A3.8). */
export interface VoiceGatewayPrincipal {
  readonly kind: "voice_gateway";
  readonly tenantId: string;
  readonly resolvedFromPhoneNumberId: string;
}

/** The telephony partner webhook sender, authenticated via HMAC (A3.8). */
export interface TelephonyPartnerPrincipal {
  readonly kind: "telephony_partner";
}

/** The scheduled retention job, using workload identity with no ingress path (A3.8). */
export interface RetentionJobPrincipal {
  readonly kind: "retention_job";
}

export type Principal =
  | HumanPrincipal
  | VoiceGatewayPrincipal
  | TelephonyPartnerPrincipal
  | RetentionJobPrincipal;

export function toActorPrincipalType(principal: Principal): ActorPrincipalType {
  return principal.kind;
}
