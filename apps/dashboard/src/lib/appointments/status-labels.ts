import type { AppointmentStatus } from "@voice-receptionist/shared";
import type { MessagePath } from "../i18n/message-path";

export const APPOINTMENT_STATUS_LABEL_KEYS: Record<AppointmentStatus, MessagePath> = {
  pending: "appointment.statusPending",
  confirmed: "appointment.statusConfirmed",
  cancelled: "appointment.statusCancelled",
  completed: "appointment.statusCompleted",
  no_show: "appointment.statusNoShow",
};
