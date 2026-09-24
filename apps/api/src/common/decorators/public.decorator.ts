import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a route as reachable without an authenticated session (login, TOTP
 * challenge, refresh, and machine-principal webhooks, which authenticate
 * themselves through other means — see A3.8). Authorization is still
 * evaluated server-side per Constraint 2.7; this only opts a route out of
 * SessionGuard's cookie check.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
