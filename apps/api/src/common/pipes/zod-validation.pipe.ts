import { type PipeTransform, Injectable } from "@nestjs/common";
import type { ZodSchema } from "zod";
import { ValidationError } from "@voice-receptionist/shared";

/**
 * Coding standard 7.3: every external input is validated with a Zod schema
 * at the trust boundary. Usage: @Body(new ZodValidationPipe(mySchema)).
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError("Request validation failed.", {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
