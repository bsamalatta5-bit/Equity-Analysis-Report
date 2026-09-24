import { Injectable } from "@nestjs/common";
import { authenticator } from "otplib";

/** A3.4: mandatory TOTP for tenant_owner and location_manager. */
@Injectable()
export class TotpService {
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  keyUri(email: string, secret: string, issuer: string): string {
    return authenticator.keyuri(email, issuer, secret);
  }

  verify(code: string, secret: string): boolean {
    try {
      return authenticator.verify({ token: code, secret });
    } catch {
      return false;
    }
  }
}
