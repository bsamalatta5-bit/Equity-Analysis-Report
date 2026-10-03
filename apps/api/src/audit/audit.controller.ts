import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentHumanPrincipal } from "../common/decorators/current-principal.decorator";
import { TenantContext } from "../common/context/tenant-context";
import { assertTenantAccess } from "../common/authorization/scope";
import type { HumanPrincipal } from "@voice-receptionist/shared";

@Controller("tenants/:tenantId/audit-log")
export class AuditController {
  constructor(private readonly tenantContext: TenantContext) {}

  @Roles("tenant_owner", "platform_operator")
  @Get()
  async list(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    return this.tenantContext.tx.auditLog.findMany({
      where: { tenantId },
      orderBy: { occurredAt: "desc" },
      take: 100,
    });
  }
}
