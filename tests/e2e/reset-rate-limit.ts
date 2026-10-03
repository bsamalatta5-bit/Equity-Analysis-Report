import { connect } from "node:net";

/**
 * A3.5's auth rate limiter counts login attempts per source IP and never
 * resets the counter itself (only a successful login resets the
 * per-account key). Every spec file in this suite signs in from the same
 * loopback address, so running the full suite — now comfortably past 10
 * logins in total — trips the IP-level limit for files that happen to run
 * later, even though each file's own login count is well under the
 * threshold. Each file resets its own counter before signing in so it
 * stays green regardless of run order or how many other files already ran;
 * this never touches the per-account key, so a real brute-force attempt
 * against one account is still throttled exactly as before.
 *
 * Talks to Redis directly over its inline command protocol (a single
 * `DEL\r\n`-terminated line) rather than adding a Redis client dependency
 * just for this one command.
 */
export async function resetAuthRateLimit(ip: string): Promise<void> {
  const redisUrl = new URL(process.env["REDIS_URL"] ?? "redis://localhost:6379");
  const port = Number(redisUrl.port || 6379);

  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host: redisUrl.hostname, port }, () => {
      socket.write(`DEL auth-rate-limit:ip:${ip}\r\n`);
    });
    socket.once("data", () => {
      socket.end();
      resolve();
    });
    socket.once("error", reject);
  });
}
