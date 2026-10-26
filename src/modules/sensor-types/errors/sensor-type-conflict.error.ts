import { ApplicationError } from "@/errors/application.error.js";

export class SensorTypeConflictError extends ApplicationError {
  constructor(message = "Sensor type with this name already exists") {
    super(409, message);
  }
}
