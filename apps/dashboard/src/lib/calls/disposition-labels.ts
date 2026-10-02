import type { CallDisposition } from "@voice-receptionist/shared";
import type { MessagePath } from "../i18n/message-path";

export const CALL_DISPOSITION_LABEL_KEYS: Record<CallDisposition, MessagePath> = {
  contained: "calls.dispositionContained",
  escalated: "calls.dispositionEscalated",
  abandoned: "calls.dispositionAbandoned",
  message_captured: "calls.dispositionMessageCaptured",
  emergency_transfer: "calls.dispositionEmergencyTransfer",
  provider_failure: "calls.dispositionProviderFailure",
  spend_limit_suspended: "calls.dispositionSpendLimitSuspended",
};
