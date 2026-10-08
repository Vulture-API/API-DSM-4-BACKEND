import { ApplicationError } from "@/errors/application.error.js";

export class SensorTypeNotFoundError extends ApplicationError {
  constructor() {
    super(404, "Sensor type not found");
  }
}
