import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";
import { TenantContext } from "./context/tenant-context";

/** Providers every feature module needs: the DB client and the per-request RLS transaction store. */
@Global()
@Module({
  providers: [PrismaService, TenantContext],
  exports: [PrismaService, TenantContext],
})
export class CommonModule {}
