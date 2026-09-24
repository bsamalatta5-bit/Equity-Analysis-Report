import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AppLoggerModule } from "./common/logging/app-logger.module";
import { RedisModule } from "./common/redis/redis.module";
import { CommonModule } from "./common/common.module";
import { SessionGuard } from "./common/guards/session.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { CsrfGuard } from "./common/guards/csrf.guard";
import { RequestContextInterceptor } from "./common/interceptors/request-context.interceptor";
import { TenantContextInterceptor } from "./common/interceptors/tenant-context.interceptor";
import { AppExceptionFilter } from "./common/filters/app-exception.filter";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { TenantsModule } from "./tenants/tenants.module";
import { LocationsModule } from "./locations/locations.module";
import { CatalogModule } from "./catalog/catalog.module";
import { AvailabilityModule } from "./availability/availability.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { AuditModule } from "./audit/audit.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppLoggerModule,
    RedisModule,
    CommonModule,
    AuthModule,
    HealthModule,
    AuditModule,
    TenantsModule,
    LocationsModule,
    CatalogModule,
    AvailabilityModule,
    AppointmentsModule,
  ],
  providers: [
    // Order matters: SessionGuard establishes request.principal, RolesGuard
    // and CsrfGuard both depend on it having already run.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_FILTER, useClass: AppExceptionFilter },
  ],
})
export class AppModule {}
