import { Injectable } from "@nestjs/common";
import { omitUndefined } from "../common/utils/omit-undefined";
import type { Prisma } from "@prisma/client";
import {
  NotFoundError,
  type CreateServiceRequest,
  type CreateStaffMemberRequest,
  type UpdateServiceRequest,
  type UpdateStaffMemberRequest,
} from "@voice-receptionist/shared";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class CatalogService {
  constructor(private readonly audit: AuditService) {}

  async listServices(tx: Prisma.TransactionClient, locationId: string) {
    return tx.service.findMany({ where: { locationId }, orderBy: { nameEn: "asc" } });
  }

  async createService(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
    actorUserId: string,
    data: CreateServiceRequest,
  ) {
    const service = await tx.service.create({ data: { ...data, locationId } });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "service.create",
      entityType: "Service",
      entityId: service.id,
    });
    return service;
  }

  async updateService(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
    actorUserId: string,
    serviceId: string,
    data: UpdateServiceRequest,
  ) {
    const existing = await tx.service.findUnique({ where: { id: serviceId } });
    if (!existing || existing.locationId !== locationId) {
      throw new NotFoundError("Service", serviceId);
    }
    const service = await tx.service.update({ where: { id: serviceId }, data: omitUndefined(data) });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "service.update",
      entityType: "Service",
      entityId: serviceId,
    });
    return service;
  }

  async listStaffMembers(tx: Prisma.TransactionClient, locationId: string) {
    return tx.staffMember.findMany({ where: { locationId }, orderBy: { displayName: "asc" } });
  }

  async createStaffMember(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
    actorUserId: string,
    data: CreateStaffMemberRequest,
  ) {
    const staffMember = await tx.staffMember.create({ data: { ...data, locationId } });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "staff_member.create",
      entityType: "StaffMember",
      entityId: staffMember.id,
    });
    return staffMember;
  }

  async updateStaffMember(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
    actorUserId: string,
    staffMemberId: string,
    data: UpdateStaffMemberRequest,
  ) {
    const existing = await tx.staffMember.findUnique({ where: { id: staffMemberId } });
    if (!existing || existing.locationId !== locationId) {
      throw new NotFoundError("StaffMember", staffMemberId);
    }
    const staffMember = await tx.staffMember.update({ where: { id: staffMemberId }, data: omitUndefined(data) });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "staff_member.update",
      entityType: "StaffMember",
      entityId: staffMemberId,
    });
    return staffMember;
  }
}
