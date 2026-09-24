import { Module } from "@nestjs/common";
import { SESSION_VALIDATOR } from "../common/context/session-validator";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { PasswordService } from "./password.service";
import { TotpService } from "./totp.service";
import { SessionService } from "./session.service";
import { RefreshTokenService } from "./refresh-token.service";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRateLimitService,
    PasswordService,
    TotpService,
    SessionService,
    RefreshTokenService,
    { provide: SESSION_VALIDATOR, useExisting: SessionService },
  ],
  exports: [SESSION_VALIDATOR, SessionService, PasswordService],
})
export class AuthModule {}
