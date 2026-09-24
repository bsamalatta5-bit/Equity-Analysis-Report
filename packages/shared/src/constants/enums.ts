export const APPOINTMENT_STATUS = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[number];

export const APPOINTMENT_SOURCE = ["voice_call", "dashboard", "import"] as const;
export type AppointmentSource = (typeof APPOINTMENT_SOURCE)[number];

export const CALL_DISPOSITION = [
  "contained",
  "escalated",
  "abandoned",
  "message_captured",
  "emergency_transfer",
  "provider_failure",
] as const;
export type CallDisposition = (typeof CALL_DISPOSITION)[number];

export const CALL_DIRECTION = ["inbound"] as const;
export type CallDirection = (typeof CALL_DIRECTION)[number];

export const USER_ROLE = [
  "tenant_owner",
  "location_manager",
  "front_desk_user",
  "platform_operator",
] as const;
export type UserRole = (typeof USER_ROLE)[number];

export const CALL_TURN_SPEAKER = ["caller", "assistant"] as const;
export type CallTurnSpeaker = (typeof CALL_TURN_SPEAKER)[number];

export const KNOWLEDGE_LANGUAGE = ["ar", "en"] as const;
export type KnowledgeLanguage = (typeof KNOWLEDGE_LANGUAGE)[number];

export const TENANT_STATUS = ["active", "suspended", "offboarded"] as const;
export type TenantStatus = (typeof TENANT_STATUS)[number];

export const USER_STATUS = ["active", "disabled", "pending_totp_enrollment"] as const;
export type UserStatus = (typeof USER_STATUS)[number];

export const PHONE_NUMBER_STATUS = ["provisioning", "active", "released"] as const;
export type PhoneNumberStatus = (typeof PHONE_NUMBER_STATUS)[number];

export const SUBSCRIPTION_STATUS = ["active", "past_due", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[number];

export const ESCALATION_TRIGGER_TYPE = [
  "explicit_request",
  "low_confidence",
  "emergency",
  "provider_failure",
  "silence_timeout",
] as const;
export type EscalationTriggerType = (typeof ESCALATION_TRIGGER_TYPE)[number];

export const ACTOR_PRINCIPAL_TYPE = ["human_user", "voice_gateway", "retention_job", "telephony_partner"] as const;
export type ActorPrincipalType = (typeof ACTOR_PRINCIPAL_TYPE)[number];
