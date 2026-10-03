import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import type { HumanPrincipal } from "@voice-receptionist/shared";
import {
  createAvailabilityRuleRequestSchema,
  createBlockedPeriodRequestSchema,
  openSlotQuerySchema,
} from "@voice-receptionist/shared";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentHumanPrincipal } from "../common/decorators/current-principal.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TenantContext } from "../common/context/tenant-context";
import { assertLocationAccess, assertTenantAccess } from "../common/authorization/scope";
import { AvailabilityService } from "./availability.service";

@Controller("tenants/:tenantId/locations/:locationId")
export class AvailabilityController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Roles("tenant_owner", "location_manager", "front_desk_user")
  @Get("staff/:staffMemberId/availability-rules")
  async listRules(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @Param("staffMemberId", new ParseUUIDPipe()) staffMemberId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.availability.listRules(this.tenantContext.tx, staffMemberId);
  }

  @Roles("tenant_owner", "location_manager")
  @Post("staff/:staffMemberId/availability-rules")
  async createRule(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @Param("staffMemberId", new ParseUUIDPipe()) staffMemberId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(createAvailabilityRuleRequestSchema))
    body: ReturnType<typeof createAvailabilityRuleRequestSchema.parse>,
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.availability.createRule(this.tenantContext.tx, tenantId, principal.userId, {
      ...body,
      staffMemberId,
    });
  }

  @Roles("tenant_owner", "location_manager")
  @Post("staff/:staffMemberId/blocked-periods")
  async createBlockedPeriod(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @Param("staffMemberId", new ParseUUIDPipe()) staffMemberId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(createBlockedPeriodRequestSchema))
    body: ReturnType<typeof createBlockedPeriodRequestSchema.parse>,
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.availability.createBlockedPeriod(this.tenantContext.tx, tenantId, principal.userId, {
      ...body,
      staffMemberId,
    });
  }

  @Roles("tenant_owner", "location_manager", "front_desk_user")
  @Get("open-slots")
  async openSlots(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Query(new ZodValidationPipe(openSlotQuerySchema.omit({ locationId: true })))
    query: Omit<ReturnType<typeof openSlotQuerySchema.parse>, "locationId">,
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.availability.findOpenSlots(this.tenantContext.tx, { ...query, locationId });
  }
}
