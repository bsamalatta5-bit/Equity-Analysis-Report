import { Controller, Get, Param, ParseUUIDPipe, Res } from "@nestjs/common";
import type { Response } from "express";
import type { HumanPrincipal } from "@voice-receptionist/shared";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { CurrentHumanPrincipal } from "../common/decorators/current-principal.decorator";
import { TenantContext } from "../common/context/tenant-context";
import { assertLocationAccess, assertTenantAccess } from "../common/authorization/scope";
import { CallsService } from "./calls.service";

@Controller("tenants/:tenantId/locations/:locationId/calls")
export class CallsController {
  constructor(
    private readonly calls: CallsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Roles("tenant_owner", "location_manager", "front_desk_user", "platform_operator")
  @Get()
  async listCalls(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.calls.listCalls(this.tenantContext.tx, locationId);
  }

  @Roles("tenant_owner", "location_manager", "front_desk_user")
  @Get(":callId/transcript")
  async getCallTranscript(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @Param("callId", new ParseUUIDPipe()) callId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    return this.calls.getCallTranscript(this.tenantContext.tx, locationId, callId);
  }

  /** A10.2: "Call recordings | R | R (scoped) | — | —" — front_desk_user and platform_operator are deliberately excluded. */
  @Roles("tenant_owner", "location_manager")
  @Get(":callId/recording")
  async issueRecordingUrl(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @Param("callId", new ParseUUIDPipe()) callId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    assertLocationAccess(principal, locationId);
    const { token, expiresAt } = await this.calls.issueRecordingSignedUrl(
      this.tenantContext.tx,
      locationId,
      callId,
    );
    return { url: `/recordings/${token}`, expiresAt };
  }
}

/**
 * A10.2: deliberately its own controller, outside the tenant/location route
 * tree above — the signed token is the entire authorization boundary here
 * (issued only by the RBAC-gated route above), exactly like a real
 * pre-signed object-store URL. @Public() opts this route out of
 * SessionGuard; TenantContextInterceptor already passes any request with
 * no `principal` straight through untouched (see its own comment), so no
 * RLS-scoped transaction is opened for this route at all — retrieval
 * reads encrypted bytes off disk, not a tenant-scoped database row.
 */
@Controller("recordings")
export class RecordingsController {
  constructor(private readonly calls: CallsService) {}

  @Public()
  @Get(":token")
  async serveRecording(@Param("token") token: string, @Res() res: Response): Promise<void> {
    const bytes = await this.calls.retrieveRecordingByToken(token);
    res.set("Content-Type", "audio/wav");
    res.set("Cache-Control", "private, no-store");
    res.send(bytes);
  }
}
