import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import type { HumanPrincipal } from "@voice-receptionist/shared";
import {
  createLocationRequestSchema,
  createPhoneNumberRequestSchema,
  updateLocationRequestSchema,
  updatePhoneNumberRequestSchema,
} from "@voice-receptionist/shared";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentHumanPrincipal } from "../common/decorators/current-principal.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TenantContext } from "../common/context/tenant-context";
import { assertLocationAccess, assertTenantAccess } from "../common/authorization/scope";
import { LocationsService } from "./locations.service";

function allowedLocationIdsFor(principal: HumanPrincipal): readonly string[] | null {
  if (principal.role === "location_manager" || principal.role === "front_desk_user") {
    return principal.assignedLocationIds;
  }
  return null;
}

@Controller("tenants/:tenantId")
export class LocationsController {
  constructor(
    private readonly locations: LocationsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Roles("tenant_owner", "location_manager", "front_desk_user", "platform_operator")
  @Get("locations")
  async list(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    return this.locations.list(this.tenantContext.tx, tenantId, allowedLocationIdsFor(principal));
  }

  @Roles("tenant_owner", "location_manager", "front_desk_user", "platform_operator")
  @Get("locations/:locationId")
  async get(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.locations.get(this.tenantContext.tx, tenantId, locationId);
  }

  @Roles("tenant_owner")
  @Post("locations")
  async create(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(createLocationRequestSchema)) body: Parameters<LocationsService["create"]>[3],
  ) {
    assertTenantAccess(principal, tenantId);
    return this.locations.create(this.tenantContext.tx, tenantId, principal.userId, body);
  }

  @Roles("tenant_owner", "location_manager")
  @Patch("locations/:locationId")
  async update(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(updateLocationRequestSchema)) body: Parameters<LocationsService["update"]>[4],
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.locations.update(this.tenantContext.tx, tenantId, locationId, principal.userId, body);
  }

  @Roles("tenant_owner", "location_manager", "platform_operator")
  @Get("phone-numbers")
  async listPhoneNumbers(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Query("locationId") locationId?: string,
  ) {
    assertTenantAccess(principal, tenantId);
    if (locationId) {
      assertLocationAccess(principal, locationId);
    }
    const numbers = await this.locations.listPhoneNumbers(this.tenantContext.tx, tenantId, locationId);
    if (principal.role === "platform_operator") {
      return numbers.map((n) => ({ id: n.id, locationId: n.locationId, status: n.status }));
    }
    return numbers;
  }

  @Roles("tenant_owner")
  @Post("phone-numbers")
  async createPhoneNumber(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(createPhoneNumberRequestSchema))
    body: Parameters<LocationsService["createPhoneNumber"]>[3],
  ) {
    assertTenantAccess(principal, tenantId);
    return this.locations.createPhoneNumber(this.tenantContext.tx, tenantId, principal.userId, body);
  }

  @Roles("tenant_owner")
  @Patch("phone-numbers/:phoneNumberId")
  async updatePhoneNumberStatus(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("phoneNumberId", new ParseUUIDPipe()) phoneNumberId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(updatePhoneNumberRequestSchema))
    body: Parameters<LocationsService["updatePhoneNumberStatus"]>[4],
  ) {
    assertTenantAccess(principal, tenantId);
    return this.locations.updatePhoneNumberStatus(
      this.tenantContext.tx,
      tenantId,
      principal.userId,
      phoneNumberId,
      body,
    );
  }
}
