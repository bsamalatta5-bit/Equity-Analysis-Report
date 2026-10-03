import { ForbiddenError, type HumanPrincipal } from "@voice-receptionist/shared";

/**
 * A3.6: a forbidden operation returns 403 with no resource data — so every
 * tenant- or location-scoped handler checks access explicitly instead of
 * relying on row-level security to silently return an empty result for a
 * path parameter that does not belong to the caller.
 */
export function assertTenantAccess(principal: HumanPrincipal, tenantId: string): void {
  if (principal.role === "platform_operator") {
    return;
  }
  if (principal.tenantId !== tenantId) {
    throw new ForbiddenError();
  }
}

/**
 * Roles whose matrix cell says "(scoped)" (location_manager, front_desk_user)
 * may only touch the locations assigned to them (UserLocation). tenant_owner
 * has unscoped access to every location in their own tenant.
 */
export function assertLocationAccess(principal: HumanPrincipal, locationId: string): void {
  if (principal.role === "tenant_owner") {
    return;
  }
  if (principal.role === "platform_operator") {
    return;
  }
  if (!principal.assignedLocationIds.includes(locationId)) {
    throw new ForbiddenError();
  }
}

export function isWriteRole(principal: HumanPrincipal, writeRoles: readonly HumanPrincipal["role"][]): boolean {
  return writeRoles.includes(principal.role);
}
