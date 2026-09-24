import { z } from "zod";

export const loginRequestSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const totpVerifyRequestSchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "TOTP codes are six digits."),
});
export type TotpVerifyRequest = z.infer<typeof totpVerifyRequestSchema>;

export const totpEnrollConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "TOTP codes are six digits."),
});
export type TotpEnrollConfirm = z.infer<typeof totpEnrollConfirmSchema>;

export const refreshRequestSchema = z.object({}).strict();
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(256),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
