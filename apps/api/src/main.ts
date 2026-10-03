import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { createLogger } from "@voice-receptionist/logger";
import { AppModule } from "./app.module";
import { applySecurityHeaders } from "./security";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  const httpLogger = createLogger({ serviceName: "api" });
  app.use(pinoHttp({ logger: httpLogger }));

  applySecurityHeaders(app);
  app.use(cookieParser());

  app.enableCors({
    origin: config.get<string>("DASHBOARD_ORIGIN") ?? "http://localhost:3000",
    credentials: true,
  });

  const port = config.get<number>("API_PORT") ?? 3001;
  await app.listen(port);
  httpLogger.info({ port }, "API listening");
}

void bootstrap();
