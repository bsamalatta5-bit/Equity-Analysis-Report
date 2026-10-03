import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  NotFoundError,
  type CreateLocationRequest,
  type CreatePhoneNumberRequest,
  type UpdateLocationRequest,
  type UpdatePhoneNumberRequest,
} from "@voice-receptionist/shared";
import { AuditService } from "../audit/audit.service";
import { omitUndefined } from "../common/utils/omit-undefined";

@Injectable()
export class LocationsService {
  constructor(private readonly audit: AuditService) {}

  async list(tx: Prisma.TransactionClient, tenantId: string, allowedLocationIds: readonly string[] | null) {
    return tx.location.findMany({
      where: { tenantId, ...(allowedLocationIds ? { id: { in: [...allowedLocationIds] } } : {}) },
      orderBy: { name: "asc" },
    });
  }

  async get(tx: Prisma.TransactionClient, tenantId: string, locationId: string) {
    const location = await tx.location.findUnique({ where: { id: locationId } });
    if (!location || location.tenantId !== tenantId) {
      throw new NotFoundError("Location", locationId);
    }
    return location;
  }

  async create(tx: Prisma.TransactionClient, tenantId: string, actorUserId: string, data: CreateLocationRequest) {
    const location = await tx.location.create({ data: { ...data, tenantId } });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "location.create",
      entityType: "Location",
      entityId: location.id,
    });
    return location;
  }

  async update(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
    actorUserId: string,
    data: UpdateLocationRequest,
  ) {
    await this.get(tx, tenantId, locationId);
    const location = await tx.location.update({ where: { id: locationId }, data: omitUndefined(data) });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "location.update",
      entityType: "Location",
      entityId: locationId,
    });
    return location;
  }

  async listPhoneNumbers(tx: Prisma.TransactionClient, tenantId: string, locationId?: string) {
    return tx.phoneNumber.findMany({
      where: { tenantId, ...(locationId ? { locationId } : {}) },
    });
  }

  async createPhoneNumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    data: CreatePhoneNumberRequest,
  ) {
    await this.get(tx, tenantId, data.locationId);
    const phoneNumber = await tx.phoneNumber.create({ data: { ...data, tenantId } });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "phone_number.create",
      entityType: "PhoneNumber",
      entityId: phoneNumber.id,
    });
    return phoneNumber;
  }

  async updatePhoneNumberStatus(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    phoneNumberId: string,
    data: UpdatePhoneNumberRequest,
  ) {
    const existing = await tx.phoneNumber.findUnique({ where: { id: phoneNumberId } });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundError("PhoneNumber", phoneNumberId);
    }
    const phoneNumber = await tx.phoneNumber.update({ where: { id: phoneNumberId }, data });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "phone_number.update_status",
      entityType: "PhoneNumber",
      entityId: phoneNumberId,
    });
    return phoneNumber;
  }
}
