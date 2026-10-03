import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { z } from "zod";
import {
  AccountLockedError,
  THRESHOLDS,
  UnauthenticatedError,
  type UserRole,
} from "@voice-receptionist/shared";
import { REDIS_CLIENT } from "../common/redis/redis.module";
import { PrismaService } from "../common/prisma/prisma.service";
import { PasswordService } from "./password.service";
import { TotpService } from "./totp.service";
import { SessionService } from "./session.service";
import { RefreshTokenService } from "./refresh-token.service";

const TOTP_REQUIRED_ROLES: readonly UserRole[] = ["tenant_owner", "location_manager"];
const CHALLENGE_TTL_SECONDS = 5 * 60;

const challengeSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: z.enum(["tenant_owner", "location_manager", "front_desk_user", "platform_operator"]),
  pendingTotpSecret: z.string().optional(),
});
type Challenge = z.infer<typeof challengeSchema>;

export type LoginResult =
  | { readonly status: "session"; readonly sessionToken: string; readonly refreshToken: string }
  | { readonly status: "totp_required"; readonly challengeToken: string }
  | { readonly status: "totp_enrollment_required"; readonly challengeToken: string };

// A fixed dummy hash so a login attempt for a non-existent email spends
// roughly the same time as one for a real email with a wrong password,
// rather than returning immediately and leaking which emails are registered.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$WMKGnDhbjZ2FBSD+3xnI9Q9a3v6dYyN3N8b8Uu5o5sQ";

function challengeKey(token: string): string {
  return `auth-challenge:${token}`;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly sessions: SessionService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const tenantId = await this.resolveTenantIdForEmail(email);

    if (!tenantId) {
      await this.passwords.verify(DUMMY_HASH, password);
      throw new UnauthenticatedError("Invalid email or password.");
    }

    const user = await this.prisma.withTenant(tenantId, false, (tx) =>
      tx.user.findUnique({ where: { email } }),
    );

    if (!user || user.status === "disabled") {
      await this.passwords.verify(DUMMY_HASH, password);
      throw new UnauthenticatedError("Invalid email or password.");
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AccountLockedError(user.lockedUntil);
    }

    const passwordValid = await this.passwords.verify(user.passwordHash, password);
    if (!passwordValid) {
      await this.recordFailedAttempt(tenantId, user.id, user.failedAttempts);
      throw new UnauthenticatedError("Invalid email or password.");
    }

    await this.prisma.withTenant(tenantId, false, (tx) =>
      tx.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } }),
    );

    const requiresTotp = TOTP_REQUIRED_ROLES.includes(user.role);
    if (!requiresTotp) {
      return this.issueSession(user.id, tenantId, user.role);
    }

    if (!user.totpSecret || !user.totpEnrolledAt) {
      const challengeToken = randomBytes(32).toString("hex");
      const pendingSecret = this.totp.generateSecret();
      const challenge: Challenge = {
        userId: user.id,
        tenantId,
        role: user.role,
        pendingTotpSecret: pendingSecret,
      };
      await this.redis.set(challengeKey(challengeToken), JSON.stringify(challenge), "EX", CHALLENGE_TTL_SECONDS);
      return { status: "totp_enrollment_required", challengeToken };
    }

    const challengeToken = randomBytes(32).toString("hex");
    const challenge: Challenge = { userId: user.id, tenantId, role: user.role };
    await this.redis.set(challengeKey(challengeToken), JSON.stringify(challenge), "EX", CHALLENGE_TTL_SECONDS);
    return { status: "totp_required", challengeToken };
  }

  async verifyTotp(challengeToken: string, code: string): Promise<LoginResult & { status: "session" }> {
    const challenge = await this.readChallenge(challengeToken);
    if (challenge.pendingTotpSecret) {
      throw new UnauthenticatedError("This challenge is for enrollment, not verification.");
    }

    const user = await this.prisma.withTenant(challenge.tenantId, false, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: challenge.userId } }),
    );
    if (!user.totpSecret || !this.totp.verify(code, user.totpSecret)) {
      throw new UnauthenticatedError("TOTP code is invalid.");
    }

    await this.redis.del(challengeKey(challengeToken));
    return this.issueSession(challenge.userId, challenge.tenantId, challenge.role);
  }

  async startTotpEnrollment(challengeToken: string): Promise<{ secret: string; otpauthUri: string }> {
    const challenge = await this.readChallenge(challengeToken);
    if (!challenge.pendingTotpSecret) {
      throw new UnauthenticatedError("This challenge does not require enrollment.");
    }
    const user = await this.prisma.withTenant(challenge.tenantId, false, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: challenge.userId } }),
    );
    return {
      secret: challenge.pendingTotpSecret,
      otpauthUri: this.totp.keyUri(user.email, challenge.pendingTotpSecret, "Voice Receptionist"),
    };
  }

  async confirmTotpEnrollment(
    challengeToken: string,
    code: string,
  ): Promise<LoginResult & { status: "session" }> {
    const challenge = await this.readChallenge(challengeToken);
    const pendingTotpSecret = challenge.pendingTotpSecret;
    if (!pendingTotpSecret) {
      throw new UnauthenticatedError("This challenge does not require enrollment.");
    }
    if (!this.totp.verify(code, pendingTotpSecret)) {
      throw new UnauthenticatedError("TOTP code is invalid.");
    }

    await this.prisma.withTenant(challenge.tenantId, false, (tx) =>
      tx.user.update({
        where: { id: challenge.userId },
        data: {
          totpSecret: pendingTotpSecret,
          totpEnrolledAt: new Date(),
          status: "active",
        },
      }),
    );

    await this.redis.del(challengeKey(challengeToken));
    return this.issueSession(challenge.userId, challenge.tenantId, challenge.role);
  }

  async refresh(refreshTokenPlaintext: string): Promise<{ sessionToken: string; refreshToken: string }> {
    const rotated = await this.refreshTokens.rotate(refreshTokenPlaintext);
    const user = await this.prisma.withTenant(rotated.tenantId, false, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: rotated.userId } }),
    );
    const assignedLocationIds = await this.assignedLocationIds(rotated.tenantId, user.id);
    const sessionToken = await this.sessions.issue({
      userId: user.id,
      tenantId: rotated.tenantId,
      role: user.role,
      assignedLocationIds,
    });
    return { sessionToken, refreshToken: rotated.plaintextToken };
  }

  async logout(sessionToken: string | undefined): Promise<void> {
    if (sessionToken) {
      await this.sessions.revoke(sessionToken);
    }
  }

  async changePassword(
    userId: string,
    tenantId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.withTenant(tenantId, false, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId } }),
    );
    const currentValid = await this.passwords.verify(user.passwordHash, currentPassword);
    if (!currentValid) {
      throw new UnauthenticatedError("Current password is incorrect.");
    }
    const newHash = await this.passwords.hash(newPassword);
    await this.prisma.withTenant(tenantId, false, (tx) =>
      tx.user.update({ where: { id: userId }, data: { passwordHash: newHash } }),
    );
  }

  private async issueSession(
    userId: string,
    tenantId: string,
    role: UserRole,
  ): Promise<LoginResult & { status: "session" }> {
    const assignedLocationIds = await this.assignedLocationIds(tenantId, userId);
    const [sessionToken, refreshToken] = await Promise.all([
      this.sessions.issue({ userId, tenantId, role, assignedLocationIds }),
      this.refreshTokens.issueFamily(userId, tenantId),
    ]);
    return { status: "session", sessionToken, refreshToken };
  }

  private async assignedLocationIds(tenantId: string, userId: string): Promise<string[]> {
    const rows = await this.prisma.withTenant(tenantId, false, (tx) =>
      tx.userLocation.findMany({ where: { userId }, select: { locationId: true } }),
    );
    return rows.map((row) => row.locationId);
  }

  private async recordFailedAttempt(tenantId: string, userId: string, currentAttempts: number): Promise<void> {
    const attempts = currentAttempts + 1;
    const shouldLock = attempts >= THRESHOLDS.AUTH_RATE_LIMIT_ATTEMPTS;
    await this.prisma.withTenant(tenantId, false, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: shouldLock
          ? {
              failedAttempts: 0,
              lockedUntil: new Date(Date.now() + THRESHOLDS.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000),
            }
          : { failedAttempts: attempts },
      }),
    );
  }

  /** Calls the SECURITY DEFINER function so a login attempt can find a tenant before app.current_tenant_id is known. */
  private async resolveTenantIdForEmail(email: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ resolve_tenant_id_for_email: string | null }[]>`
      SELECT resolve_tenant_id_for_email(${email})
    `;
    return rows[0]?.resolve_tenant_id_for_email ?? null;
  }

  private async readChallenge(token: string): Promise<Challenge> {
    const raw = await this.redis.get(challengeKey(token));
    if (!raw) {
      throw new UnauthenticatedError("Challenge is invalid or has expired.");
    }
    const parsed = challengeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new UnauthenticatedError("Challenge is invalid or has expired.");
    }
    return parsed.data;
  }
}
