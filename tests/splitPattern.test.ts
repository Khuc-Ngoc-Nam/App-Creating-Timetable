import { describe, expect, it } from "vitest";
import { defaultSplitPattern, parseSplitPattern, validateSplitPattern } from "../src/core/splitPattern";

describe("splitPattern", () => {
  it("parses Vietnamese-style split patterns", () => {
    expect(parseSplitPattern("3 + 3 + 3 + 2 + 2")).toEqual([3, 3, 3, 2, 2]);
    expect(parseSplitPattern("1, 2; 3")).toEqual([1, 2, 3]);
  });

  it("creates balanced primary-school defaults", () => {
    expect(defaultSplitPattern(13, 4, 5)).toBe("3 + 3 + 3 + 2 + 2");
    expect(defaultSplitPattern(14, 4, 5)).toBe("3 + 3 + 3 + 3 + 2");
  });

  it("validates totals and session limits", () => {
    expect(validateSplitPattern("3 + 2", 5, 4)).toEqual([]);
    expect(validateSplitPattern("3 + 2", 6, 4)[0]).toContain("khác tổng tiết");
    expect(validateSplitPattern("5", 5, 4)[0]).toContain("vượt số tiết");
  });
});
