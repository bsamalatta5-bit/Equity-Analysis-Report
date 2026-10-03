// A13.load: a real k6 scenario against a real running apps/api instance —
// not a sketch. Run tests/load/seed.ts first (see tests/load/README.md);
// this script reads its output via open(), which k6 only permits at the
// top-level init scope, hence this being read here rather than in setup().
import http from "k6/http";
import { check } from "k6";

const fixture = JSON.parse(open("./.fixture.json"));
const API_BASE_URL = __ENV.API_BASE_URL || "http://localhost:3001";
const SESSION_COOKIE_NAME = "__Host-session";

export const options = {
  scenarios: {
    dashboard_reads: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 20 },
        { duration: "30s", target: 20 },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    // A4.2 set a 200ms p95 budget for the open-slot query specifically, in
    // process. This is a real HTTP round trip through the full guard/
    // interceptor stack against a list endpoint, so the budget is looser.
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
};

export function setup() {
  const loginRes = http.post(
    `${API_BASE_URL}/auth/login`,
    JSON.stringify({ email: fixture.email, password: fixture.password }),
    { headers: { "Content-Type": "application/json" } },
  );
  if (loginRes.status !== 200) {
    throw new Error(`setup login failed: ${loginRes.status} ${loginRes.body}`);
  }
  const setCookieHeaders = loginRes.headers["Set-Cookie"];
  const rawCookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  const sessionCookie = rawCookies
    .map((entry) => (entry || "").split(";")[0])
    .find((entry) => entry.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!sessionCookie) {
    throw new Error("setup login did not return a session cookie");
  }
  return { cookieHeader: sessionCookie };
}

export default function (data) {
  const res = http.get(
    `${API_BASE_URL}/tenants/${fixture.tenantId}/locations/${fixture.locationId}/calls`,
    { headers: { Cookie: data.cookieHeader } },
  );
  check(res, {
    "status is 200": (r) => r.status === 200,
    "returned the seeded calls": (r) => JSON.parse(r.body).length === 20,
  });
}
