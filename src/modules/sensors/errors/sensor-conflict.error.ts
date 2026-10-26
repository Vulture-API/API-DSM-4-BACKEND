import { ApplicationError } from "@/errors/application.error.js";

export class SensorConflictError extends ApplicationError {
  constructor(
    message = "Sensor conflict or duplicate local identifier on station",
  ) {
    super(409, message);
  }
}
