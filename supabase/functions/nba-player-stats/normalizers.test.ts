import { assertEquals } from "jsr:@std/assert@1";
import { normalizeFractionPercentage, toNullableNumber } from "./normalizers.ts";

Deno.test("missing and malformed stats normalize to null", () => {
  assertEquals(toNullableNumber(null), null);
  assertEquals(toNullableNumber(undefined), null);
  assertEquals(toNullableNumber(""), null);
  assertEquals(toNullableNumber("   "), null);
  assertEquals(toNullableNumber("not-a-number"), null);
});

Deno.test("legitimate numeric zero is preserved", () => {
  assertEquals(toNullableNumber(0), 0);
  assertEquals(toNullableNumber("0"), 0);
  assertEquals(normalizeFractionPercentage(0), 0);
});

Deno.test("NBA fractional percentages convert to display percentages", () => {
  assertEquals(normalizeFractionPercentage(0.425), 42.5);
  assertEquals(normalizeFractionPercentage(null), null);
  assertEquals(normalizeFractionPercentage(""), null);
});
