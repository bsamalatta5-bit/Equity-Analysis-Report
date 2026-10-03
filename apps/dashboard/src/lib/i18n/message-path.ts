import type { Messages } from "./messages/types";

type Primitive = string | number | boolean;

/** Every dotted path to a leaf (string) value in Messages, e.g. "auth.signInTitle". */
export type MessagePath<T = Messages, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends Primitive
    ? `${Prefix}${K}`
    : T[K] extends object
      ? MessagePath<T[K], `${Prefix}${K}.`>
      : never;
}[keyof T & string];

export function resolveMessage(messages: Messages, path: MessagePath): string {
  const parts = path.split(".");
  let current: unknown = messages;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) {
      throw new Error(`Missing message for path "${path}".`);
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== "string") {
    throw new Error(`Missing message for path "${path}".`);
  }
  return current;
}
