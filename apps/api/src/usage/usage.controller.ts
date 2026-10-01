import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import type { HumanPrincipal } from "@voice-receptionist/shared";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentHumanPrincipal } from "../common/decorators/current-principal.decorator";
import { TenantContext } from "../common/context/tenant-context";
import { assertTenantAccess } from "../common/authorization/scope";

/** RBAC matrix: "Usage and billing | R | — | — | R" — only tenant_owner and platform_operator. */
@Controller("tenants/:tenantId/usage")
export class UsageController {
  constructor(private readonly tenantContext: TenantContext) {}

  @Roles("tenant_owner", "platform_operator")
  @Get()
  async getUsage(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @CurrentHumanPrincipal() principal: HumanPrincipal,
  ) {
    assertTenantAccess(principal, tenantId);
    const [subscription, usageRecords] = await Promise.all([
      this.tenantContext.tx.subscription.findFirst({ where: { tenantId, status: "active" } }),
      this.tenantContext.tx.usageRecord.findMany({
        where: { tenantId },
        orderBy: { periodStart: "desc" },
        take: 24,
      }),
    ]);
    return { subscription, usageRecords };
  }
}
