import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import cookieParser from "cookie-parser";
import Redis from "ioredis";
import { authenticator } from "otplib";
import request from "supertest";
import { AppModule } from "../../apps/api/src/app.module";
import { applySecurityHeaders } from "../../apps/api/src/security";

/** Bypasses RLS entirely (migrator/superuser) — test setup and assertions only, never app code. */
export const migratorPrisma = new PrismaClient({
  datasources: { db: { url: process.env["DATABASE_MIGRATOR_URL"]! } },
});

/**
 * A3.5's per-address rate limit is deliberately shared across every login
 * attempt from this process's IP, exactly as it would be for real traffic.
 * A fresh CI job gets an empty Redis and never notices; a local repeated
 * `pnpm test:integration` run — or a suite that deliberately trips the
 * limiter in one test and logs in normally in the next — would otherwise
 * see spurious 429s. Call this once per spec file before any login.
 */
export async function resetAuthRateLimits(): Promise<void> {
  const redis = new Redis(process.env["REDIS_URL"]!);
  try {
    const keys = await redis.keys("auth-rate-limit:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } finally {
    await redis.quit();
  }
}

export async function bootstrapApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  applySecurityHeaders(app);
  app.use(cookieParser());
  await app.init();
  return app;
}

async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export interface TestUserSpec {
  readonly role: "tenant_owner" | "location_manager" | "front_desk_user" | "platform_operator";
  readonly password: string;
}

export interface TestTenantFixture {
  readonly tenantId: string;
  readonly locationId: string;
  readonly otherLocationId: string;
  readonly staffMemberId: string;
  readonly serviceId: string;
  readonly users: Record<
    string,
    { userId: string; email: string; password: string; totpSecret: string | null }
  >;
}

/** Builds one fully-formed tenant per call (unique ids/emails), suitable for parallel-safe reuse within a file. */
export async function createTestTenant(userSpecs: Record<string, TestUserSpec>): Promise<TestTenantFixture> {
  const suffix = randomUUID().slice(0, 8);

  const tenant = await migratorPrisma.tenant.create({
    data: {
      legalName: `Test Clinic ${suffix}`,
      commercialRegistration: `CR-${suffix}`,
      status: "active",
      planCode: "test",
    },
  });

  const location = await migratorPrisma.location.create({
    data: {
      tenantId: tenant.id,
      name: `Main Branch ${suffix}`,
      addressLine: "Test Address",
      timezone: "Asia/Riyadh",
      active: true,
    },
  });

  const otherLocation = await migratorPrisma.location.create({
    data: {
      tenantId: tenant.id,
      name: `Second Branch ${suffix}`,
      addressLine: "Test Address 2",
      timezone: "Asia/Riyadh",
      active: true,
    },
  });

  const staffMember = await migratorPrisma.staffMember.create({
    data: { locationId: location.id, displayName: `Staff ${suffix}`, active: true },
  });

  const service = await migratorPrisma.service.create({
    data: {
      locationId: location.id,
      nameAr: "خدمة اختبار",
      nameEn: `Test Service ${suffix}`,
      durationMinutes: 30,
      statedPrice: 100,
      active: true,
    },
  });

  await migratorPrisma.availabilityRule.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      staffMemberId: staffMember.id,
      weekday,
      startTime: "00:00",
      endTime: "23:30",
      effectiveFrom: new Date("2020-01-01"),
    })),
  });

  const users: TestTenantFixture["users"] = {};
  for (const [key, spec] of Object.entries(userSpecs)) {
    const email = `${key}-${suffix}@test.example`;
    const passwordHash = await hashPassword(spec.password);
    const requiresTotp = spec.role === "tenant_owner" || spec.role === "location_manager";
    const totpSecret = requiresTotp ? authenticator.generateSecret() : null;
    const user = await migratorPrisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash,
        role: spec.role,
        status: "active",
        totpSecret,
        totpEnrolledAt: requiresTotp ? new Date() : null,
      },
    });
    if (spec.role === "location_manager" || spec.role === "front_desk_user") {
      await migratorPrisma.userLocation.create({ data: { userId: user.id, locationId: location.id } });
    }
    users[key] = { userId: user.id, email, password: spec.password, totpSecret };
  }

  return {
    tenantId: tenant.id,
    locationId: location.id,
    otherLocationId: otherLocation.id,
    staffMemberId: staffMember.id,
    serviceId: service.id,
    users,
  };
}

function extractCookieValue(setCookieHeaders: readonly string[] | undefined, name: string): string {
  const header = (setCookieHeaders ?? []).find((entry) => entry.startsWith(`${name}=`));
  if (!header) {
    throw new Error(`Expected a Set-Cookie header for ${name}.`);
  }
  return header.split(";")[0]!.slice(name.length + 1);
}

/**
 * A hand-rolled cookie jar, not superagent's built-in `.agent()` jar: that
 * jar (the `cookiejar` package) filters out `Secure` cookies whenever the
 * request URL's protocol isn't https — which supertest's in-memory server
 * always is (plain http://127.0.0.1:<port>), even though the app is
 * correctly marking __Host-session/refresh_token as Secure per A3.2. A
 * real browser only ever sees this over TLS, where the flag behaves
 * correctly; here it would just silently drop every auth cookie. Forwarding
 * the raw Cookie header manually sidesteps that entirely.
 */
export interface AuthenticatedAgent {
  readonly csrfToken: string;
  readonly agent: {
    get(url: string): request.Test;
    post(url: string): request.Test;
    patch(url: string): request.Test;
    delete(url: string): request.Test;
  };
}

function buildAgent(app: INestApplication, cookieHeader: string): AuthenticatedAgent["agent"] {
  const withCookie = (test: request.Test) => test.set("Cookie", cookieHeader);
  return {
    get: (url) => withCookie(request(app.getHttpServer()).get(url)),
    post: (url) => withCookie(request(app.getHttpServer()).post(url)),
    patch: (url) => withCookie(request(app.getHttpServer()).patch(url)),
    delete: (url) => withCookie(request(app.getHttpServer()).delete(url)),
  };
}

/** Logs in through the real HTTP endpoints (password + TOTP where required), returning a cookie-forwarding agent. */
export async function loginAgent(
  app: INestApplication,
  user: { email: string; password: string; totpSecret: string | null },
): Promise<AuthenticatedAgent> {
  const loginRes = await request(app.getHttpServer())
    .post("/auth/login")
    .send({ email: user.email, password: user.password });
  if (loginRes.status !== 200) {
    throw new Error(`Login failed: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }

  let setCookie = loginRes.headers["set-cookie"] as unknown as string[] | undefined;

  if (loginRes.body.status === "totp_required" && user.totpSecret) {
    const code = authenticator.generate(user.totpSecret);
    const verifyRes = await request(app.getHttpServer())
      .post("/auth/totp/verify")
      .send({ challengeToken: loginRes.body.challengeToken, code });
    if (verifyRes.status !== 200) {
      throw new Error(`TOTP verification failed: ${verifyRes.status} ${JSON.stringify(verifyRes.body)}`);
    }
    setCookie = verifyRes.headers["set-cookie"] as unknown as string[] | undefined;
  } else if (loginRes.body.status !== "session") {
    throw new Error(`Unexpected login result: ${JSON.stringify(loginRes.body)}`);
  }

  const sessionToken = extractCookieValue(setCookie, "__Host-session");
  const csrfToken = extractCookieValue(setCookie, "csrf_token");
  const cookieHeader = `__Host-session=${sessionToken}; csrf_token=${csrfToken}`;

  return { csrfToken, agent: buildAgent(app, cookieHeader) };
}
