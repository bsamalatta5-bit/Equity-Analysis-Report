import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { isSlotContentionError, VALID_TRANSITIONS } from "./appointments.service";

describe("VALID_TRANSITIONS", () => {
  it("allows confirmed -> completed, cancelled, no_show", () => {
    expect(VALID_TRANSITIONS.confirmed).toEqual(
      expect.arrayContaining(["completed", "cancelled", "no_show"]),
    );
  });

  it("terminal states (cancelled, completed, no_show) allow no further transition", () => {
    expect(VALID_TRANSITIONS.cancelled).toEqual([]);
    expect(VALID_TRANSITIONS.completed).toEqual([]);
    expect(VALID_TRANSITIONS.no_show).toEqual([]);
  });

  it("pending allows only confirmed or cancelled", () => {
    expect([...VALID_TRANSITIONS.pending].sort()).toEqual(["cancelled", "confirmed"]);
  });
});

describe("isSlotContentionError", () => {
  it("returns true for a PrismaClientKnownRequestError mentioning the exclusion constraint", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'conflicting key value violates exclusion constraint "appointment_no_overlap"',
      { code: "P2010", clientVersion: "5.22.0" },
    );
    expect(isSlotContentionError(error)).toBe(true);
  });

  it("returns false for an unrelated PrismaClientKnownRequestError", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "5.22.0",
    });
    expect(isSlotContentionError(error)).toBe(false);
  });

  it("returns false for a plain Error", () => {
    expect(isSlotContentionError(new Error("appointment_no_overlap"))).toBe(false);
  });

  it("returns false for a non-error value", () => {
    expect(isSlotContentionError("appointment_no_overlap")).toBe(false);
    expect(isSlotContentionError(undefined)).toBe(false);
  });
});
