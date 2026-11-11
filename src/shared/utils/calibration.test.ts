import { describe, expect, it } from "vitest";

import {
  invalidCalibrationField,
  isValidMultiplier,
  isValidOffset,
} from "@/shared/utils/calibration.js";

describe("calibration rules", () => {
  it.each([
    ["absent", undefined],
    ["null", null],
    ["positive", 1.5],
    ["negative", -2],
    ["a small fraction", 0.000805860805],
  ])("should_accept_a_multiplier_%s", (_case, value) => {
    expect(isValidMultiplier(value)).toBe(true);
  });

  it.each([
    ["zero", 0],
    ["negative zero", -0],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["negative infinite", Number.NEGATIVE_INFINITY],
  ])("should_reject_a_multiplier_%s", (_case, value) => {
    expect(isValidMultiplier(value)).toBe(false);
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["zero", 0],
    ["negative", -12.5],
    ["fractional", 0.125],
  ])("should_accept_an_offset_%s", (_case, value) => {
    expect(isValidOffset(value)).toBe(true);
  });

  it.each([
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("should_reject_an_offset_%s", (_case, value) => {
    expect(isValidOffset(value)).toBe(false);
  });

  it("should_accept_a_calibration_without_any_field", () => {
    expect(invalidCalibrationField({})).toBeNull();
  });

  it("should_accept_a_complete_calibration", () => {
    expect(
      invalidCalibrationField({ factor: 3.6, gain: 0.5, offset_value: -1 }),
    ).toBeNull();
  });

  it("should_name_the_first_invalid_field", () => {
    expect(invalidCalibrationField({ factor: 0, gain: 0 })).toBe("factor");
    expect(invalidCalibrationField({ factor: 1, gain: 0 })).toBe("gain");
    expect(invalidCalibrationField({ gain: 2, offset_value: Number.NaN })).toBe(
      "offset_value",
    );
  });
});
