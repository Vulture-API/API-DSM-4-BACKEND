import { ApplicationError } from "@/errors/application.error.js";

export class InvalidPeriodError extends ApplicationError {
  constructor(message: string) {
    super(400, "INVALID_PERIOD", message);
  }
}
