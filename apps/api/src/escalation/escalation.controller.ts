import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import type { HumanPrincipal } from "@voice-receptionist/shared";
import {
  createEscalationRuleRequestSchema,
  updateEscalationRuleRequestSchema,
} from "@voice-receptionist/shared";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentHumanPrincipal } from "../common/decorators/current-principal.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TenantContext } from "../common/context/tenant-context";
import { assertLocationAccess, assertTenantAccess } from "../common/authorization/scope";
import { EscalationService } from "./escalation.service";

@Controller("tenants/:tenantId/locations/:locationId/escalation-rules")
export class EscalationController {
  constructor(
    private readonly escalation: EscalationService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Roles("tenant_owner", "location_manager", "front_desk_user")
  @Get()
  async listEscalationRules(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.escalation.listEscalationRules(this.tenantContext.tx, locationId);
  }

  @Roles("tenant_owner", "location_manager")
  @Post()
  async createEscalationRule(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(createEscalationRuleRequestSchema))
    body: Parameters<EscalationService["createEscalationRule"]>[4],
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.escalation.createEscalationRule(
      this.tenantContext.tx,
      tenantId,
      locationId,
      principal.userId,
      body,
    );
  }

  @Roles("tenant_owner", "location_manager")
  @Patch(":escalationRuleId")
  async updateEscalationRule(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @Param("escalationRuleId", new ParseUUIDPipe()) escalationRuleId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(updateEscalationRuleRequestSchema))
    body: Parameters<EscalationService["updateEscalationRule"]>[5],
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.escalation.updateEscalationRule(
      this.tenantContext.tx,
      tenantId,
      locationId,
      principal.userId,
      escalationRuleId,
      body,
    );
  }

  @Roles("tenant_owner")
  @Delete(":escalationRuleId")
  async deleteEscalationRule(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @Param("escalationRuleId", new ParseUUIDPipe()) escalationRuleId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    await this.escalation.deleteEscalationRule(
      this.tenantContext.tx,
      tenantId,
      locationId,
      principal.userId,
      escalationRuleId,
    );
    return { status: "ok" };
  }
}
