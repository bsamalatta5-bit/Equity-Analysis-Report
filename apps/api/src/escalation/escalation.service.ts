import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  NotFoundError,
  type CreateEscalationRuleRequest,
  type UpdateEscalationRuleRequest,
} from "@voice-receptionist/shared";
import { AuditService } from "../audit/audit.service";
import { omitUndefined } from "../common/utils/omit-undefined";

@Injectable()
export class EscalationService {
  constructor(private readonly audit: AuditService) {}

  async listEscalationRules(tx: Prisma.TransactionClient, locationId: string) {
    return tx.escalationRule.findMany({ where: { locationId } });
  }

  async createEscalationRule(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
    actorUserId: string,
    data: CreateEscalationRuleRequest,
  ) {
    const rule = await tx.escalationRule.create({
      data: {
        locationId,
        triggerType: data.triggerType,
        targetPhoneE164: data.targetPhoneE164,
        activeHours: data.activeHours,
      },
    });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "escalation_rule.create",
      entityType: "EscalationRule",
      entityId: rule.id,
    });
    return rule;
  }

  async updateEscalationRule(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
    actorUserId: string,
    escalationRuleId: string,
    data: UpdateEscalationRuleRequest,
  ) {
    const existing = await tx.escalationRule.findUnique({ where: { id: escalationRuleId } });
    if (!existing || existing.locationId !== locationId) {
      throw new NotFoundError("EscalationRule", escalationRuleId);
    }
    const rule = await tx.escalationRule.update({
      where: { id: escalationRuleId },
      data: omitUndefined(data),
    });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "escalation_rule.update",
      entityType: "EscalationRule",
      entityId: escalationRuleId,
    });
    return rule;
  }

  async deleteEscalationRule(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
    actorUserId: string,
    escalationRuleId: string,
  ) {
    const existing = await tx.escalationRule.findUnique({ where: { id: escalationRuleId } });
    if (!existing || existing.locationId !== locationId) {
      throw new NotFoundError("EscalationRule", escalationRuleId);
    }
    await tx.escalationRule.delete({ where: { id: escalationRuleId } });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "escalation_rule.delete",
      entityType: "EscalationRule",
      entityId: escalationRuleId,
    });
  }
}
