import { ApplicationError } from "@/errors/application.error.js";

export class SensorNotFoundError extends ApplicationError {
  constructor() {
    super(404, "Sensor not found");
  }
}
