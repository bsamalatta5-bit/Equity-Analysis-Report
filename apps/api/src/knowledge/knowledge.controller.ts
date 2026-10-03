import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import type { HumanPrincipal } from "@voice-receptionist/shared";
import {
  createKnowledgeItemRequestSchema,
  updateKnowledgeItemRequestSchema,
} from "@voice-receptionist/shared";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentHumanPrincipal } from "../common/decorators/current-principal.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TenantContext } from "../common/context/tenant-context";
import { assertTenantAccess } from "../common/authorization/scope";
import { KnowledgeService } from "./knowledge.service";

/**
 * KnowledgeItem is tenant-scoped, not location-scoped (Section 5's data
 * model gives it a tenantId, no locationId) — the RBAC matrix's "(scoped)"
 * for location_manager has nothing to scope down to here, so it collapses
 * to plain tenant access, same as CatalogController's assertTenantAccess.
 */
@Controller("tenants/:tenantId/knowledge")
export class KnowledgeController {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Roles("tenant_owner", "location_manager", "front_desk_user")
  @Get()
  async listKnowledgeItems(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    return this.knowledge.listKnowledgeItems(this.tenantContext.tx, tenantId);
  }

  @Roles("tenant_owner", "location_manager")
  @Post()
  async createKnowledgeItem(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(createKnowledgeItemRequestSchema))
    body: Parameters<KnowledgeService["createKnowledgeItem"]>[3],
  ) {
    assertTenantAccess(principal, tenantId);
    return this.knowledge.createKnowledgeItem(this.tenantContext.tx, tenantId, principal.userId, body);
  }

  @Roles("tenant_owner", "location_manager")
  @Patch(":knowledgeItemId")
  async updateKnowledgeItem(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("knowledgeItemId", new ParseUUIDPipe()) knowledgeItemId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(updateKnowledgeItemRequestSchema))
    body: Parameters<KnowledgeService["updateKnowledgeItem"]>[4],
  ) {
    assertTenantAccess(principal, tenantId);
    return this.knowledge.updateKnowledgeItem(
      this.tenantContext.tx,
      tenantId,
      principal.userId,
      knowledgeItemId,
      body,
    );
  }

  @Roles("tenant_owner")
  @Delete(":knowledgeItemId")
  async deleteKnowledgeItem(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("knowledgeItemId", new ParseUUIDPipe()) knowledgeItemId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    await this.knowledge.deleteKnowledgeItem(
      this.tenantContext.tx,
      tenantId,
      principal.userId,
      knowledgeItemId,
    );
    return { status: "ok" };
  }
}
