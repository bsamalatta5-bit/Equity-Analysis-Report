import type { UserRole } from "@voice-receptionist/shared";
import type { MessagePath } from "../i18n/message-path";

export const ROLE_LABEL_KEYS: Record<UserRole, MessagePath> = {
  tenant_owner: "users.roleTenantOwner",
  location_manager: "users.roleLocationManager",
  front_desk_user: "users.roleFrontDeskUser",
  platform_operator: "users.rolePlatformOperator",
};
