import { describe, expect, it } from "vitest";
import { omitUndefined } from "./omit-undefined";

describe("omitUndefined", () => {
  it("drops keys whose value is undefined", () => {
    expect(omitUndefined({ a: 1, b: undefined })).toEqual({ a: 1 });
  });

  it("keeps keys whose value is null (distinct from undefined)", () => {
    expect(omitUndefined({ a: null, b: undefined })).toEqual({ a: null });
  });

  it("keeps falsy-but-defined values", () => {
    expect(omitUndefined({ a: 0, b: "", c: false, d: undefined })).toEqual({ a: 0, b: "", c: false });
  });

  it("returns an equivalent object when nothing is undefined", () => {
    expect(omitUndefined({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("handles an empty object", () => {
    expect(omitUndefined({})).toEqual({});
  });
});
