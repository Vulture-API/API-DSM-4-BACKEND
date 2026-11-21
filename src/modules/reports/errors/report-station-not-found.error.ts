import { ApplicationError } from "@/errors/application.error.js";

export class ReportStationNotFoundError extends ApplicationError {
  constructor(stationId: number) {
    super(
      404,
      "STATION_NOT_FOUND",
      `A estação meteorológica com ID ${stationId} não foi encontrada no sistema.`,
    );
  }
}
