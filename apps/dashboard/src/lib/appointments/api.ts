import type { AppointmentStatus } from "@voice-receptionist/shared";
import { apiFetch } from "../api/client";
import type { ServiceSummary, StaffMemberSummary } from "../catalog/api";

export interface ContactSummary {
  readonly id: string;
  readonly phoneE164: string;
  readonly displayName: string | null;
  readonly preferredLanguage: string | null;
}

export interface AppointmentSummary {
  readonly id: string;
  readonly locationId: string;
  readonly staffMemberId: string;
  readonly serviceId: string;
  readonly contactId: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly status: AppointmentStatus;
  readonly source: string;
  readonly contact: ContactSummary;
  readonly service: ServiceSummary;
  readonly staffMember: StaffMemberSummary;
}

export interface ListAppointmentsParams {
  locationId: string;
  fromDate?: string;
  toDate?: string;
  status?: AppointmentStatus;
}

function toQueryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

export function listAppointments(
  tenantId: string,
  params: ListAppointmentsParams,
): Promise<AppointmentSummary[]> {
  const query = toQueryString(params);
  return apiFetch(`/tenants/${tenantId}/appointments?${query}`);
}

export function getAppointment(tenantId: string, appointmentId: string): Promise<AppointmentSummary> {
  return apiFetch(`/tenants/${tenantId}/appointments/${appointmentId}`);
}

export interface CreateAppointmentParams {
  locationId: string;
  staffMemberId: string;
  serviceId: string;
  startAt: string;
  contact: { phoneE164: string; displayName?: string };
}

export function createAppointment(
  tenantId: string,
  params: CreateAppointmentParams,
): Promise<AppointmentSummary> {
  return apiFetch(`/tenants/${tenantId}/appointments`, {
    method: "POST",
    body: { ...params, source: "dashboard" },
  });
}

export function rescheduleAppointment(
  tenantId: string,
  appointmentId: string,
  params: { startAt: string; staffMemberId?: string },
): Promise<AppointmentSummary> {
  return apiFetch(`/tenants/${tenantId}/appointments/${appointmentId}/reschedule`, {
    method: "PATCH",
    body: params,
  });
}

export function updateAppointmentStatus(
  tenantId: string,
  appointmentId: string,
  status: AppointmentStatus,
): Promise<AppointmentSummary> {
  return apiFetch(`/tenants/${tenantId}/appointments/${appointmentId}/status`, {
    method: "PATCH",
    body: { status },
  });
}

export interface OpenSlot {
  readonly staffMemberId: string;
  readonly startAt: string;
  readonly endAt: string;
}

export interface ListOpenSlotsParams {
  serviceId: string;
  staffMemberId?: string;
  fromDate: string;
  toDate: string;
}

export function listOpenSlots(
  tenantId: string,
  locationId: string,
  params: ListOpenSlotsParams,
): Promise<OpenSlot[]> {
  const query = toQueryString(params);
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/open-slots?${query}`);
}
