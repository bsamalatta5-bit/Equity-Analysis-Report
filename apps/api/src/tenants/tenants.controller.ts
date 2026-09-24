import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import type { HumanPrincipal } from "@voice-receptionist/shared";
import {
  createTenantUserRequestSchema,
  updateTenantRequestSchema,
  updateTenantUserRequestSchema,
} from "@voice-receptionist/shared";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentHumanPrincipal } from "../common/decorators/current-principal.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TenantContext } from "../common/context/tenant-context";
import { assertTenantAccess } from "../common/authorization/scope";
import { TenantsService } from "./tenants.service";

@Controller("tenants/:tenantId")
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Roles("tenant_owner", "location_manager", "front_desk_user", "platform_operator")
  @Get()
  async getTenant(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    return this.tenants.getTenant(this.tenantContext.tx, tenantId);
  }

  @Roles("tenant_owner")
  @Patch()
  async updateTenant(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(updateTenantRequestSchema)) body: Parameters<TenantsService["updateTenant"]>[3],
  ) {
    assertTenantAccess(principal, tenantId);
    return this.tenants.updateTenant(this.tenantContext.tx, tenantId, principal.userId, body);
  }

  @Roles("tenant_owner", "platform_operator")
  @Get("users")
  async listUsers(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    return this.tenants.listUsers(this.tenantContext.tx, tenantId, principal.role === "platform_operator");
  }

  @Roles("tenant_owner")
  @Post("users")
  async createUser(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(createTenantUserRequestSchema)) body: Parameters<TenantsService["createUser"]>[3],
  ) {
    assertTenantAccess(principal, tenantId);
    return this.tenants.createUser(this.tenantContext.tx, tenantId, principal.userId, body);
  }

  @Roles("tenant_owner")
  @Patch("users/:userId")
  async updateUser(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(updateTenantUserRequestSchema)) body: Parameters<TenantsService["updateUser"]>[4],
  ) {
    assertTenantAccess(principal, tenantId);
    return this.tenants.updateUser(this.tenantContext.tx, tenantId, principal.userId, userId, body);
  }

  @Roles("tenant_owner")
  @Delete("users/:userId")
  async deleteUser(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    await this.tenants.disableUser(this.tenantContext.tx, tenantId, principal.userId, userId);
    return { status: "ok" };
  }
}
