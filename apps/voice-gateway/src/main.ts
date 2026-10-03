import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import Redis from "ioredis";
import { WebSocketServer } from "ws";
import { createLogger } from "@voice-receptionist/logger";
import { AppError } from "@voice-receptionist/shared";
import { createVoiceGatewayPrismaClient } from "./common/prisma-client";
import { createTelephonyProvider } from "./providers/provider-factory";
import { CallSessionStore } from "./session/call-session-store";
import { TelephonyWebhookHandler } from "./telephony/webhook-handler";
import { TelephonyWebhookRateLimiter } from "./telephony/webhook-rate-limit";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function flattenHeaders(req: IncomingMessage): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key] = Array.isArray(value) ? value[0] : value;
  }
  return headers;
}

async function bootstrap(): Promise<void> {
  const logger = createLogger({ serviceName: "voice-gateway" });

  const redis = new Redis(requireEnv("REDIS_URL"));
  const prisma = createVoiceGatewayPrismaClient(requireEnv("DATABASE_URL"));
  const telephonyProvider = createTelephonyProvider(
    process.env["TELEPHONY_PROVIDER"] ?? "fixture",
    requireEnv("TELEPHONY_WEBHOOK_SIGNING_SECRET"),
    redis,
  );
  const sessionStore = new CallSessionStore(redis);
  const rateLimiter = new TelephonyWebhookRateLimiter(redis);
  const webhookHandler = new TelephonyWebhookHandler(telephonyProvider, prisma, sessionStore, rateLimiter, logger);

  const httpServer = createServer((req, res) => {
    void handleRequest(req, res);
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === "POST" && req.url === "/webhooks/telephony/call-events") {
      const rawBody = await readRawBody(req);
      const sourceAddress = req.socket.remoteAddress ?? "unknown";
      try {
        const result = await webhookHandler.handle({ rawBody, headers: flattenHeaders(req) }, sourceAddress);
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result));
      } catch (error) {
        if (error instanceof AppError) {
          res.writeHead(error.httpStatus, { "content-type": "application/json" }).end(
            JSON.stringify({ code: error.code, message: error.message }),
          );
          return;
        }
        logger.error({ err: error }, "Unhandled webhook error");
        res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ code: "INTERNAL_ERROR" }));
      }
      return;
    }

    if (req.method === "GET" && req.url === "/health/live") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.writeHead(404).end();
  }

  // A5.2: the media session's WebSocket endpoint. Establishes and tracks
  // connections; real bidirectional audio streaming needs a selected
  // speech provider, which Module 1's unresolved halt gate blocks — see
  // docs/adr/dialect-feasibility-verdict.md.
  const wss = new WebSocketServer({ server: httpServer, path: "/media" });
  wss.on("connection", (socket) => {
    logger.info("Media WebSocket connection established");
    socket.on("close", () => logger.info("Media WebSocket connection closed"));
  });

  const port = Number(process.env["VOICE_GATEWAY_PORT"] ?? 3002);
  httpServer.listen(port, () => {
    logger.info({ port }, "voice-gateway listening");
  });
}

void bootstrap();
