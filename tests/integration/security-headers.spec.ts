import { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootstrapApp } from "./fixtures";

/**
 * A13.7: proves the security headers `apps/api/src/security.ts` sets are
 * actually present on a real response from the real bootstrap path (the
 * same `applySecurityHeaders` call `main.ts` makes), not merely declared
 * in source and never exercised.
 */
describe("Security response headers (Module 13, A13.7)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sets a maximally restrictive CSP with no script/style/img grants, since this server never renders a document", async () => {
    const res = await request(app.getHttpServer()).get("/health/live");
    const csp = res.headers["content-security-policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("object-src 'none'");
    // No nonce anywhere — nothing on this server ever asks CSP to permit an inline script/style.
    expect(csp).not.toContain("nonce-");
  });

  it("sets the rest of helmet's standard hardening headers", async () => {
    const res = await request(app.getHttpServer()).get("/health/live");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(res.headers["strict-transport-security"]).toContain("max-age=");
    // Helmet removes this by default; a removed header beats an accurate one for not leaking version info.
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
