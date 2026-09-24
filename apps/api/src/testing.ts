/** Test-only entry point: lets tests/integration and tests/isolation import the real app graph. */
export { AppModule } from "./app.module";
export { PrismaService } from "./common/prisma/prisma.service";
export { SESSION_COOKIE_NAME } from "./common/guards/session.guard";
export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "./common/guards/csrf.guard";
export { REFRESH_COOKIE_NAME } from "./auth/cookies";
