import { ApplicationError } from "@/errors/application.error.js";

export class StationCoordinatesMissingError extends ApplicationError {
  constructor(stationId: number, stationName?: string) {
    const nameStr = stationName ? ` ('${stationName}')` : "";
    super(
      422,
      "STATION_WITHOUT_COORDINATES",
      `A estação com ID ${stationId}${nameStr} não possui coordenadas geográficas cadastradas (latitude e longitude), obrigatórias para consulta de previsões meteorológicas.`,
    );
  }
}
