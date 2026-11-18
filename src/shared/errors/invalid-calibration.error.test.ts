import { describe, expect, it } from "vitest";

import {
  assertValidCalibration,
  InvalidCalibrationError,
} from "@/shared/errors/invalid-calibration.error.js";

describe("assertValidCalibration", () => {
  it("should_not_throw_for_a_valid_or_absent_calibration", () => {
    expect(() => assertValidCalibration({})).not.toThrow();
    expect(() =>
      assertValidCalibration({ factor: null, gain: 2, offset_value: 0 }),
    ).not.toThrow();
  });

  it("should_throw_a_400_naming_the_multiplier_that_is_zero", () => {
    const attempt = () => assertValidCalibration({ gain: 0 });

    expect(attempt).toThrow(InvalidCalibrationError);
    expect(attempt).toThrow(/gain must be a finite number different from zero/);
    try {
      attempt();
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 400,
        code: "INVALID_CALIBRATION",
      });
    }
  });

  it("should_throw_for_an_offset_that_is_not_finite", () => {
    expect(() =>
      assertValidCalibration({ offset_value: Number.POSITIVE_INFINITY }),
    ).toThrow(/offset_value must be a finite number/);
  });
});
