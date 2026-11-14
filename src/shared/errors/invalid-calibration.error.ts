import { ApplicationError } from "@/errors/application.error.js";
import {
  type Calibration,
  invalidCalibrationField,
} from "@/shared/utils/calibration.js";

export class InvalidCalibrationError extends ApplicationError {
  constructor(field: keyof Calibration) {
    super(
      400,
      "INVALID_CALIBRATION",
      field === "offset_value"
        ? "Invalid calibration: offset_value must be a finite number."
        : `Invalid calibration: ${field} must be a finite number different from zero.`,
    );
  }
}

export function assertValidCalibration(calibration: Calibration): void {
  const field = invalidCalibrationField(calibration);
  if (field) throw new InvalidCalibrationError(field);
}
