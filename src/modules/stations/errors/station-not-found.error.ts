import { ApplicationError } from "@/errors/application.error.js";

export class StationNotFoundError extends ApplicationError {
  constructor() {
    super(404, "STATION_NOT_FOUND", "Station not found.");
  }
}
