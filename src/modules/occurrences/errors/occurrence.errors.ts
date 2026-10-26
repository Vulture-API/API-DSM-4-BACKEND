import { ApplicationError } from "@/errors/application.error.js";

export class OccurrenceNotFoundError extends ApplicationError {
  constructor() {
    super(404, "OCCURRENCE_NOT_FOUND", "Occurrence not found.");
  }
}

export class OccurrenceAlreadyResolvedError extends ApplicationError {
  constructor() {
    super(
      409,
      "OCCURRENCE_ALREADY_RESOLVED",
      "Occurrence is already resolved.",
    );
  }
}

export class InvalidOccurrencePeriodError extends ApplicationError {
  constructor() {
    super(400, "INVALID_PERIOD", "'from' must be before or equal to 'to'.");
  }
}
