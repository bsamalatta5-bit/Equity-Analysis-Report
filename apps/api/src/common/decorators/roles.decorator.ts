import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@voice-receptionist/shared";

export const ROLES_KEY = "roles";

/** Restricts a route to the listed human roles. Machine principals never satisfy this. */
export const Roles = (...roles: readonly UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
