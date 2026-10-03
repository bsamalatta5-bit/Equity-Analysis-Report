import type { INestApplication } from "@nestjs/common";
import helmet from "helmet";

/**
 * A13.7: apps/api never renders a document — every response is JSON (or a
 * signed-URL redirect, in `apps/api/src/calls`'s recording route) — so the
 * strictest possible CSP has no script-src/style-src/img-src to grant at
 * all, and no nonce is meaningful here (a nonce exists to allow one
 * specific inline script/style through an otherwise restrictive policy;
 * nothing on this server ever requests permission to run one). Shared
 * between `main.ts`'s real bootstrap and
 * `tests/integration/fixtures.ts`'s `bootstrapApp()` so the header
 * assertion test in `tests/integration/security-headers.spec.ts` is
 * proving what production actually sends, not a parallel definition that
 * could drift from it.
 */
export function applySecurityHeaders(app: INestApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          "default-src": ["'none'"],
          "base-uri": ["'none'"],
          "frame-ancestors": ["'none'"],
          "form-action": ["'none'"],
          "object-src": ["'none'"],
        },
      },
      referrerPolicy: { policy: "no-referrer" },
      crossOriginResourcePolicy: { policy: "same-origin" },
    }),
  );
}
