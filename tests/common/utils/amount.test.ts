import { MAX_SAFE_AMOUNT, assertSafeAmount, isSafeAmount } from "../../../src/common/utils/amount";
import { ValidationError } from "../../../src/common/utils/error.handler";

describe("amount utils", () => {
  describe("MAX_SAFE_AMOUNT", () => {
    it("equals Number.MAX_SAFE_INTEGER (2^53-1)", () => {
      expect(MAX_SAFE_AMOUNT).toBe(Number.MAX_SAFE_INTEGER);
      expect(MAX_SAFE_AMOUNT).toBe(9_007_199_254_740_991);
    });
  });

  describe("isSafeAmount", () => {
    it.each([1, 100, 1000, MAX_SAFE_AMOUNT])("accepts positive safe integer %i", (v) => {
      expect(isSafeAmount(v)).toBe(true);
    });

    it.each([
      ["zero", 0],
      ["negative", -1],
      ["non-integer", 1.5],
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
      ["above MAX_SAFE_INTEGER", MAX_SAFE_AMOUNT + 1],
    ])("rejects %s", (_label, v) => {
      expect(isSafeAmount(v)).toBe(false);
    });
  });

  describe("assertSafeAmount", () => {
    it("returns the value for a valid amount", () => {
      expect(assertSafeAmount(4000)).toBe(4000);
      expect(assertSafeAmount(MAX_SAFE_AMOUNT)).toBe(MAX_SAFE_AMOUNT);
    });

    it.each([
      ["zero", 0],
      ["negative", -5],
      ["non-integer", 0.1],
      ["NaN", Number.NaN],
      ["above MAX_SAFE_INTEGER", MAX_SAFE_AMOUNT + 1],
    ])("throws ValidationError for %s", (_label, v) => {
      expect(() => assertSafeAmount(v)).toThrow(ValidationError);
    });

    it("includes the label in the error message", () => {
      expect(() => assertSafeAmount(-1, "invoice amount")).toThrow(/invoice amount/);
    });
  });
});
