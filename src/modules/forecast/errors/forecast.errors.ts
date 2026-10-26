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
  constructor(options?: { cause?: unknown }) {
    super(503, "FORECAST_UNAVAILABLE", "Forecast provider is unavailable.");
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/** Falha do provedor externo: rede, timeout, status de erro ou resposta inválida. */
export class ForecastProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ForecastProviderError";
  }
}
