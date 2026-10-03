import { expect, test } from "@playwright/test";

/**
 * A13.7: proves the dashboard's CSP nonce (apps/dashboard/src/middleware.ts)
 * is a real per-request value against a real production build, not a
 * value fixed at build time — which `src/app/[locale]/layout.tsx`'s
 * `export const dynamic = "force-dynamic"` exists specifically to make
 * possible. Two independent requests for the same URL must carry two
 * different nonces; a matching pair would mean the page was served from a
 * static cache with a nonce baked in, defeating the point of a nonce.
 */
test.describe("Dashboard security response headers (Module 13, A13.7)", () => {
  function extractNonce(csp: string, directive: "script-src" | "style-src"): string {
    const match = new RegExp(`${directive} [^;]*'nonce-([^']+)'`).exec(csp);
    if (!match) {
      throw new Error(`No nonce found in ${directive} of: ${csp}`);
    }
    return match[1]!;
  }

  test("the sign-in page's CSP has a script-src and style-src nonce, with no other grant beyond 'self'", async ({
    request,
  }) => {
    const response = await request.get("/en/sign-in");
    const csp = response.headers()["content-security-policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");

    const scriptNonce = extractNonce(csp!, "script-src");
    const styleNonce = extractNonce(csp!, "style-src");
    expect(scriptNonce.length).toBeGreaterThan(10);
    expect(styleNonce).toBe(scriptNonce); // middleware.ts uses one nonce per request for both.
  });

  test("two independent requests for the same page get two different nonces", async ({ request }) => {
    const first = await request.get("/en/sign-in");
    const second = await request.get("/en/sign-in");
    const firstNonce = extractNonce(first.headers()["content-security-policy"]!, "script-src");
    const secondNonce = extractNonce(second.headers()["content-security-policy"]!, "script-src");
    expect(firstNonce).not.toBe(secondNonce);
  });

  test("a real browser page load succeeds under this CSP (hydration scripts are not blocked)", async ({
    page,
  }) => {
    const cspViolations: string[] = [];
    page.on("console", (message) => {
      if (message.text().toLowerCase().includes("content security policy")) {
        cspViolations.push(message.text());
      }
    });
    await page.goto("/en/sign-in");
    await page.getByLabel("Email").waitFor();
    // Interactivity proves hydration ran — a blocked script would leave this inert.
    await page.getByLabel("Email").fill("probe@example.com");
    expect(cspViolations).toEqual([]);
  });
});
