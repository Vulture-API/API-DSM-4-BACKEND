import { ApplicationError } from "@/errors/application.error.js";

export class InvalidCollectionIntervalError extends ApplicationError {
  constructor(min: number, max: number) {
    super(
      400,
      "INVALID_COLLECTION_INTERVAL",
      `Collection interval must be an integer between ${min} and ${max} seconds.`,
    );
  }
}
