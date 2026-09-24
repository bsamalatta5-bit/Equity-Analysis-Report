import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import type { HumanPrincipal } from "@voice-receptionist/shared";
import {
  createAppointmentRequestSchema,
  listAppointmentsQuerySchema,
  rescheduleAppointmentRequestSchema,
  updateAppointmentStatusRequestSchema,
} from "@voice-receptionist/shared";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentHumanPrincipal } from "../common/decorators/current-principal.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TenantContext } from "../common/context/tenant-context";
import { assertLocationAccess, assertTenantAccess } from "../common/authorization/scope";
import { AppointmentsService } from "./appointments.service";

@Controller("tenants/:tenantId/appointments")
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Roles("tenant_owner", "location_manager", "front_desk_user")
  @Get()
  async list(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Query(new ZodValidationPipe(listAppointmentsQuerySchema))
    query: ReturnType<typeof listAppointmentsQuerySchema.parse>,
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, query.locationId);
    return this.appointments.list(this.tenantContext.tx, tenantId, query);
  }

  @Roles("tenant_owner", "location_manager", "front_desk_user")
  @Post()
  async book(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(createAppointmentRequestSchema))
    body: ReturnType<typeof createAppointmentRequestSchema.parse>,
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, body.locationId);
    return this.appointments.book(this.tenantContext.tx, tenantId, principal.userId, "human_user", body);
  }

  @Roles("tenant_owner", "location_manager", "front_desk_user")
  @Patch(":appointmentId/reschedule")
  async reschedule(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("appointmentId", new ParseUUIDPipe()) appointmentId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(rescheduleAppointmentRequestSchema))
    body: ReturnType<typeof rescheduleAppointmentRequestSchema.parse>,
  ) {
    assertTenantAccess(principal, tenantId);
    return this.appointments.reschedule(this.tenantContext.tx, tenantId, principal.userId, appointmentId, body);
  }

  @Roles("tenant_owner", "location_manager", "front_desk_user")
  @Patch(":appointmentId/status")
  async updateStatus(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("appointmentId", new ParseUUIDPipe()) appointmentId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(updateAppointmentStatusRequestSchema))
    body: ReturnType<typeof updateAppointmentStatusRequestSchema.parse>,
  ) {
    assertTenantAccess(principal, tenantId);
    return this.appointments.updateStatus(
      this.tenantContext.tx,
      tenantId,
      principal.userId,
      "human_user",
      appointmentId,
      body.status,
    );
  }
}
