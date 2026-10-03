/**
 * Strips keys whose value is `undefined` from a partial DTO before handing
 * it to Prisma as an `update` input. Zod's `.optional()` fields are typed
 * `T | undefined` with the key always present; Prisma's update inputs are
 * typed `T?` and, under `exactOptionalPropertyTypes` (tsconfig.base.json),
 * reject an explicit `undefined` value for an optional key even though the
 * key itself is allowed to be absent.
 */
export function omitUndefined<T extends Record<string, unknown>>(
  input: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output as { [K in keyof T]: Exclude<T[K], undefined> };
}
