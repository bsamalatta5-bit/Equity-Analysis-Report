import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { z } from "zod";
import { RefreshTokenReusedError, THRESHOLDS, UnauthenticatedError } from "@voice-receptionist/shared";
import { REDIS_CLIENT } from "../common/redis/redis.module";
import { PrismaService } from "../common/prisma/prisma.service";

const REUSE_DETECTION_GRACE_SECONDS = 300;

const redisEntrySchema = z.object({
  familyId: z.string().uuid(),
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  status: z.enum(["active", "consumed"]),
});
type RedisEntry = z.infer<typeof redisEntrySchema>;

export interface RotatedRefreshToken {
  readonly plaintextToken: string;
  readonly userId: string;
  readonly tenantId: string;
}

function hashToken(plaintextToken: string): string {
  return createHash("sha256").update(plaintextToken).digest("hex");
}

function tokenKey(hash: string): string {
  return `refresh:${hash}`;
}

function familyRevokedKey(familyId: string): string {
  return `refresh-family-revoked:${familyId}`;
}

/**
 * A3.3: refresh tokens expire in 7 days, rotate on use, and reuse of a
 * consumed token revokes the entire family. Redis is the live validation
 * path (fast, TTL-native); RefreshTokenFamily/RefreshToken in Postgres are
 * the durable audit trail, written inside the tenant's RLS transaction.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  async issueFamily(userId: string, tenantId: string): Promise<string> {
    const familyId = randomUUID();
    const plaintextToken = randomBytes(32).toString("hex");
    const hash = hashToken(plaintextToken);
    const expiresAt = new Date(Date.now() + THRESHOLDS.REFRESH_TOKEN_TTL_SECONDS * 1000);

    await this.prisma.withTenant(tenantId, false, async (tx) => {
      await tx.refreshTokenFamily.create({ data: { id: familyId, userId } });
      await tx.refreshToken.create({
        data: { familyId, tokenHash: hash, expiresAt },
      });
    });

    const entry: RedisEntry = { familyId, userId, tenantId, status: "active" };
    await this.redis.set(
      tokenKey(hash),
      JSON.stringify(entry),
      "EX",
      THRESHOLDS.REFRESH_TOKEN_TTL_SECONDS,
    );

    return plaintextToken;
  }

  async rotate(plaintextToken: string): Promise<RotatedRefreshToken> {
    const hash = hashToken(plaintextToken);
    const raw = await this.redis.get(tokenKey(hash));
    if (!raw) {
      throw new UnauthenticatedError("Refresh token is invalid or expired.");
    }

    const parsedResult = redisEntrySchema.safeParse(JSON.parse(raw));
    if (!parsedResult.success) {
      throw new UnauthenticatedError("Refresh token is invalid or expired.");
    }
    const entry = parsedResult.data;

    const isFamilyRevoked = await this.redis.get(familyRevokedKey(entry.familyId));
    if (isFamilyRevoked) {
      throw new UnauthenticatedError("This session has been revoked.");
    }

    if (entry.status === "consumed") {
      await this.revokeFamily(entry.familyId, entry.tenantId);
      throw new RefreshTokenReusedError();
    }

    const newPlaintextToken = randomBytes(32).toString("hex");
    const newHash = hashToken(newPlaintextToken);
    const expiresAt = new Date(Date.now() + THRESHOLDS.REFRESH_TOKEN_TTL_SECONDS * 1000);

    await this.prisma.withTenant(entry.tenantId, false, async (tx) => {
      await tx.refreshToken.update({
        where: { tokenHash: hash },
        data: { consumedAt: new Date() },
      });
      await tx.refreshToken.create({
        data: { familyId: entry.familyId, tokenHash: newHash, expiresAt },
      });
    });

    const consumedEntry: RedisEntry = { ...entry, status: "consumed" };
    await this.redis.set(tokenKey(hash), JSON.stringify(consumedEntry), "EX", REUSE_DETECTION_GRACE_SECONDS);

    const newEntry: RedisEntry = { ...entry, status: "active" };
    await this.redis.set(
      tokenKey(newHash),
      JSON.stringify(newEntry),
      "EX",
      THRESHOLDS.REFRESH_TOKEN_TTL_SECONDS,
    );

    return { plaintextToken: newPlaintextToken, userId: entry.userId, tenantId: entry.tenantId };
  }

  async revokeFamily(familyId: string, tenantId: string): Promise<void> {
    await this.redis.set(
      familyRevokedKey(familyId),
      "1",
      "EX",
      THRESHOLDS.REFRESH_TOKEN_TTL_SECONDS,
    );
    await this.prisma.withTenant(tenantId, false, async (tx) => {
      await tx.refreshTokenFamily.update({
        where: { id: familyId },
        data: { revokedAt: new Date() },
      });
    });
  }
}
