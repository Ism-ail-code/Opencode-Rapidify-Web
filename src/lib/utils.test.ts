import { describe, it, expect } from "vitest";
import { cn, slugify } from "./utils";

describe("slugify", () => {
  it("lowercases and trims", () => {
    expect(slugify("  Hello World  ")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("hello world foo")).toBe("hello-world-foo");
  });

  it("removes special characters", () => {
    expect(slugify("hello! world@ #test")).toBe("hello-world-test");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("hello---world")).toBe("hello-world");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--hello-world--")).toBe("hello-world");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("returns empty string for only special chars", () => {
    expect(slugify("!!! @@@ ###")).toBe("");
  });

  it("truncates at 60 characters", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(60);
  });

  it("removes accented characters", () => {
    expect(slugify("café résumé")).toBe("caf-rsum");
  });
});

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "extra")).toBe("base extra");
  });

  it("handles undefined values", () => {
    expect(cn("a", undefined, "b")).toBe("a b");
  });

  it("resolves Tailwind conflicts (last wins)", () => {
    expect(cn("px-4", "px-2")).toBe("px-2");
  });

  it("returns empty string for no args", () => {
    expect(cn()).toBe("");
  });
});
