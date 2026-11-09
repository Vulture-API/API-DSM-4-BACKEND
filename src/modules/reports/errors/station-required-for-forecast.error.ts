import { ApplicationError } from "@/errors/application.error.js";

export class StationRequiredForForecastError extends ApplicationError {
  constructor() {
    super(
      400,
      "STATION_REQUIRED_FOR_FORECAST",
      "É obrigatório informar uma estação meteorológica ('station_id') para emissão do relatório de previsões.",
    );
  }
}
