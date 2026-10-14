import { describe, expect, it } from "vitest";

import {
  assertValidLimits,
  InvalidSensorLimitsError,
} from "@/modules/sensors/errors/invalid-sensor-limits.error.js";

describe("assertValidLimits", () => {
  it("aceita faixa válida, igual ou com um lado nulo", () => {
    expect(() => assertValidLimits(0, 10)).not.toThrow();
    expect(() => assertValidLimits(5, 5)).not.toThrow();
    expect(() => assertValidLimits(null, 10)).not.toThrow();
    expect(() => assertValidLimits(10, null)).not.toThrow();
  });

  it("recusa mínimo acima do máximo com 400", () => {
    expect(() => assertValidLimits(11, 10)).toThrow(InvalidSensorLimitsError);
    try {
      assertValidLimits(11, 10);
    } catch (error) {
      expect((error as InvalidSensorLimitsError).statusCode).toBe(400);
    }
  });
});
