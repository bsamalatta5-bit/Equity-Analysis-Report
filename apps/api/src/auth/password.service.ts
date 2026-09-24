import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { THRESHOLDS } from "@voice-receptionist/shared";

/** A3.1: argon2id at the pinned cost parameters. */
@Injectable()
export class PasswordService {
  async hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, {
      type: argon2.argon2id,
      memoryCost: THRESHOLDS.ARGON2_MEMORY_COST_KIB,
      timeCost: THRESHOLDS.ARGON2_TIME_COST,
      parallelism: THRESHOLDS.ARGON2_PARALLELISM,
    });
  }

  async verify(hash: string, plaintext: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plaintext);
    } catch {
      // argon2.verify throws on a malformed hash rather than returning
      // false; treated as a verification failure, not a system error.
      return false;
    }
  }
}
