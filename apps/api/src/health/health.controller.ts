import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import type { Redis } from "ioredis";
import { Public } from "../common/decorators/public.decorator";
import { PrismaService } from "../common/prisma/prisma.service";
import { REDIS_CLIENT } from "../common/redis/redis.module";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get("live")
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  async ready(): Promise<{ status: "ok" }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.redis.ping();
      return { status: "ok" };
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : "Dependency check failed.",
      );
    }
  }
}
