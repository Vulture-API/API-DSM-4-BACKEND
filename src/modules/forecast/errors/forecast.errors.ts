import { ApplicationError } from "@/errors/application.error.js";

export class StationWithoutCoordinatesError extends ApplicationError {
  constructor() {
    super(
      422,
      "STATION_WITHOUT_COORDINATES",
      "Station has no latitude and longitude.",
    );
  }
}

export class ForecastUnavailableError extends ApplicationError {
  constructor() {
    super(503, "FORECAST_UNAVAILABLE", "Forecast provider is unavailable.");
  }
}
