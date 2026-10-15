import { ApplicationError } from "@/errors/application.error.js";

/** min_value acima de max_value: a faixa aceita ficaria vazia. */
export class InvalidSensorLimitsError extends ApplicationError {
  constructor() {
    super(400, "Invalid sensor limits: min_value must be <= max_value.");
  }
}

export function assertValidLimits(
  min: number | null,
  max: number | null,
): void {
  if (min !== null && max !== null && min > max)
    throw new InvalidSensorLimitsError();
}
