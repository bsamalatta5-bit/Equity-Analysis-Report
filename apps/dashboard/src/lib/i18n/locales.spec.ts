import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, dirFor, isLocale, LOCALES } from "./locales";

describe("locales", () => {
  it("accepts exactly en and ar", () => {
    expect(LOCALES).toEqual(["en", "ar"]);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("")).toBe(false);
  });

  it("defaults to en", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("maps ar to rtl and en to ltr", () => {
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
  });
});
