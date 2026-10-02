import { randomBytes } from "node:crypto";
import { Body, Controller, Get, HttpCode, Ip, Patch, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  totpEnrollConfirmSchema,
  totpVerifyRequestSchema,
} from "@voice-receptionist/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthService } from "./auth.service";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { SESSION_COOKIE_NAME } from "../common/guards/session.guard";
import { CurrentHumanPrincipal } from "../common/decorators/current-principal.decorator";
import type { HumanPrincipal } from "@voice-receptionist/shared";
import { REFRESH_COOKIE_NAME, clearSessionCookies, setSessionCookies } from "./cookies";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly rateLimit: AuthRateLimitService,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: { email: string; password: string },
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: string; challengeToken?: string }> {
    await this.rateLimit.checkAndIncrement(`ip:${ip}`);
    await this.rateLimit.checkAndIncrement(`acct:${body.email.toLowerCase()}`);

    const result = await this.auth.login(body.email, body.password);
    if (result.status === "session") {
      await this.rateLimit.reset(`acct:${body.email.toLowerCase()}`);
      setSessionCookies(res, result.sessionToken, result.refreshToken, randomBytes(24).toString("hex"));
      return { status: "session" };
    }
    return { status: result.status, challengeToken: result.challengeToken };
  }

  @Public()
  @Post("totp/verify")
  @HttpCode(200)
  async verifyTotp(
    @Body(new ZodValidationPipe(totpVerifyRequestSchema)) body: { challengeToken: string; code: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: "session" }> {
    const result = await this.auth.verifyTotp(body.challengeToken, body.code);
    setSessionCookies(res, result.sessionToken, result.refreshToken, randomBytes(24).toString("hex"));
    return { status: "session" };
  }

  @Public()
  @Post("totp/enroll/start")
  @HttpCode(200)
  async startEnrollment(
    @Body(new ZodValidationPipe(totpVerifyRequestSchema.pick({ challengeToken: true })))
    body: {
      challengeToken: string;
    },
  ): Promise<{ secret: string; otpauthUri: string }> {
    return this.auth.startTotpEnrollment(body.challengeToken);
  }

  @Public()
  @Post("totp/enroll/confirm")
  @HttpCode(200)
  async confirmEnrollment(
    @Body(new ZodValidationPipe(totpVerifyRequestSchema.merge(totpEnrollConfirmSchema)))
    body: { challengeToken: string; code: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: "session" }> {
    const result = await this.auth.confirmTotpEnrollment(body.challengeToken, body.code);
    setSessionCookies(res, result.sessionToken, result.refreshToken, randomBytes(24).toString("hex"));
    return { status: "session" };
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: "session" }> {
    const refreshToken = (req.cookies as Record<string, string | undefined> | undefined)?.[
      REFRESH_COOKIE_NAME
    ];
    if (!refreshToken) {
      clearSessionCookies(res);
      res.status(401);
      return { status: "session" };
    }
    const result = await this.auth.refresh(refreshToken);
    setSessionCookies(res, result.sessionToken, result.refreshToken, randomBytes(24).toString("hex"));
    return { status: "session" };
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ status: "ok" }> {
    const sessionToken = (req.cookies as Record<string, string | undefined> | undefined)?.[
      SESSION_COOKIE_NAME
    ];
    await this.auth.logout(sessionToken);
    clearSessionCookies(res);
    return { status: "ok" };
  }

  /**
   * Module 12: the dashboard has no other way to learn which tenant and
   * role its own session cookie resolves to (every other route is scoped
   * under /tenants/:tenantId, which the dashboard cannot address without
   * this). Returns exactly the fields already on HumanPrincipal — no new
   * data access, just exposing what SessionGuard already resolved.
   */
  @Get("session")
  @HttpCode(200)
  getSession(@CurrentHumanPrincipal() principal: HumanPrincipal): {
    userId: string;
    tenantId: string;
    role: HumanPrincipal["role"];
    assignedLocationIds: readonly string[];
  } {
    return {
      userId: principal.userId,
      tenantId: principal.tenantId,
      role: principal.role,
      assignedLocationIds: principal.assignedLocationIds,
    };
  }

  @Patch("password")
  @HttpCode(200)
  async changePassword(
    @CurrentHumanPrincipal() principal: HumanPrincipal,
    @Body(new ZodValidationPipe(changePasswordRequestSchema))
    body: { currentPassword: string; newPassword: string },
  ): Promise<{ status: "ok" }> {
    await this.auth.changePassword(
      principal.userId,
      principal.tenantId,
      body.currentPassword,
      body.newPassword,
    );
    return { status: "ok" };
  }
}
