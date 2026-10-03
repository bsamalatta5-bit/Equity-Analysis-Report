import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  NotFoundError,
  type CreateTenantUserRequest,
  type UpdateTenantRequest,
  type UpdateTenantUserRequest,
} from "@voice-receptionist/shared";
import { PasswordService } from "../auth/password.service";
import { AuditService } from "../audit/audit.service";
import { omitUndefined } from "../common/utils/omit-undefined";

@Injectable()
export class TenantsService {
  constructor(
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async getTenant(tx: Prisma.TransactionClient, tenantId: string) {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundError("Tenant", tenantId);
    }
    return tenant;
  }

  async updateTenant(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    data: UpdateTenantRequest,
  ) {
    const tenant = await tx.tenant.update({ where: { id: tenantId }, data: omitUndefined(data) });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "tenant.update",
      entityType: "Tenant",
      entityId: tenantId,
    });
    return tenant;
  }

  async listUsers(tx: Prisma.TransactionClient, tenantId: string, identityOnly: boolean) {
    const users = await tx.user.findMany({ where: { tenantId }, orderBy: { email: "asc" } });
    if (!identityOnly) {
      return users.map(({ passwordHash: _passwordHash, totpSecret: _totpSecret, ...rest }) => rest);
    }
    return users.map((user) => ({ id: user.id, email: user.email, role: user.role, status: user.status }));
  }

  /**
   * `listUsers` omits location assignments (not needed by its callers).
   * The dashboard's edit-user form needs them to pre-populate its location
   * checkboxes — `updateUser`'s `locationIds` replaces the full assignment
   * set, so submitting without first knowing the current set would silently
   * wipe it.
   */
  async getUser(tx: Prisma.TransactionClient, tenantId: string, userId: string) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundError("User", userId);
    }
    const userLocations = await tx.userLocation.findMany({ where: { userId }, select: { locationId: true } });
    const { passwordHash: _passwordHash, totpSecret: _totpSecret, ...rest } = user;
    return { ...rest, locationIds: userLocations.map((row) => row.locationId) };
  }

  /**
   * No invitation channel exists in this build (Section 1 excludes
   * WhatsApp/SMS, and email delivery was never in scope for Modules 1-4).
   * A random temporary password is generated and returned once in the
   * response; conveying it to the new user is an out-of-band admin step
   * until an invitation flow is built.
   */
  async createUser(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    data: CreateTenantUserRequest,
  ) {
    const temporaryPassword = randomBytes(18).toString("base64url");
    const passwordHash = await this.passwords.hash(temporaryPassword);
    const requiresTotp = data.role === "tenant_owner" || data.role === "location_manager";

    const user = await tx.user.create({
      data: {
        tenantId,
        email: data.email,
        passwordHash,
        role: data.role,
        status: requiresTotp ? "pending_totp_enrollment" : "active",
      },
    });

    if (data.locationIds.length > 0) {
      await tx.userLocation.createMany({
        data: data.locationIds.map((locationId) => ({ userId: user.id, locationId })),
      });
    }

    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "tenant_user.create",
      entityType: "User",
      entityId: user.id,
    });

    return { ...user, passwordHash: undefined, totpSecret: undefined, temporaryPassword };
  }

  async updateUser(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    userId: string,
    data: UpdateTenantUserRequest,
  ) {
    const existing = await tx.user.findUnique({ where: { id: userId } });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundError("User", userId);
    }

    const user = await tx.user.update({
      where: { id: userId },
      data: omitUndefined({ role: data.role, status: data.status }),
    });

    if (data.locationIds) {
      await tx.userLocation.deleteMany({ where: { userId } });
      if (data.locationIds.length > 0) {
        await tx.userLocation.createMany({
          data: data.locationIds.map((locationId) => ({ userId, locationId })),
        });
      }
    }

    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "tenant_user.update",
      entityType: "User",
      entityId: userId,
    });

    return { ...user, passwordHash: undefined, totpSecret: undefined };
  }

  async disableUser(tx: Prisma.TransactionClient, tenantId: string, actorUserId: string, userId: string) {
    const existing = await tx.user.findUnique({ where: { id: userId } });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundError("User", userId);
    }
    await tx.user.update({ where: { id: userId }, data: { status: "disabled" } });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "tenant_user.disable",
      entityType: "User",
      entityId: userId,
    });
  }
}
