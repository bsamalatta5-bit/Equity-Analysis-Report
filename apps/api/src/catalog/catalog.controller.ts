import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import type { HumanPrincipal } from "@voice-receptionist/shared";
import {
  createServiceRequestSchema,
  createStaffMemberRequestSchema,
  updateServiceRequestSchema,
  updateStaffMemberRequestSchema,
} from "@voice-receptionist/shared";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentHumanPrincipal } from "../common/decorators/current-principal.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TenantContext } from "../common/context/tenant-context";
import { assertLocationAccess, assertTenantAccess } from "../common/authorization/scope";
import { CatalogService } from "./catalog.service";

@Controller("tenants/:tenantId/locations/:locationId")
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Roles("tenant_owner", "location_manager", "front_desk_user")
  @Get("services")
  async listServices(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.catalog.listServices(this.tenantContext.tx, locationId);
  }

  @Roles("tenant_owner", "location_manager")
  @Post("services")
  async createService(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(createServiceRequestSchema)) body: Parameters<CatalogService["createService"]>[4],
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.catalog.createService(this.tenantContext.tx, tenantId, locationId, principal.userId, body);
  }

  @Roles("tenant_owner", "location_manager")
  @Patch("services/:serviceId")
  async updateService(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @Param("serviceId", new ParseUUIDPipe()) serviceId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(updateServiceRequestSchema)) body: Parameters<CatalogService["updateService"]>[5],
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.catalog.updateService(this.tenantContext.tx, tenantId, locationId, principal.userId, serviceId, body);
  }

  @Roles("tenant_owner", "location_manager", "front_desk_user")
  @Get("staff")
  async listStaffMembers(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.catalog.listStaffMembers(this.tenantContext.tx, locationId);
  }

  @Roles("tenant_owner", "location_manager")
  @Post("staff")
  async createStaffMember(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(createStaffMemberRequestSchema))
    body: Parameters<CatalogService["createStaffMember"]>[4],
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.catalog.createStaffMember(this.tenantContext.tx, tenantId, locationId, principal.userId, body);
  }

  @Roles("tenant_owner", "location_manager")
  @Patch("staff/:staffMemberId")
  async updateStaffMember(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @Param("staffMemberId", new ParseUUIDPipe()) staffMemberId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(updateStaffMemberRequestSchema))
    body: Parameters<CatalogService["updateStaffMember"]>[5],
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.catalog.updateStaffMember(
      this.tenantContext.tx,
      tenantId,
      locationId,
      principal.userId,
      staffMemberId,
      body,
    );
  }
}
