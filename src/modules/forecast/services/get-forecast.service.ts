import {
  ForecastProviderError,
  ForecastUnavailableError,
  StationWithoutCoordinatesError,
} from "@/modules/forecast/errors/forecast.errors.js";
import type { ForecastProvider } from "@/modules/forecast/providers/forecast.provider.js";
import type {
  ForecastQuery,
  StationForecast,
} from "@/modules/forecast/types/forecast.type.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";

type Clock = () => Date;

export type ForecastErrorContext = ForecastQuery & { station_id: number };

/** Previsão meteorológica diária para a posição da estação (US11). */
export class GetForecastService {
  constructor(
    private readonly stations: StationRepository,
    private readonly provider: ForecastProvider,
    private readonly clock: Clock = () => new Date(),
    private readonly onProviderError: (
      error: unknown,
      context: ForecastErrorContext,
    ) => void = () => undefined,
  ) {}

  async execute(input: {
    station_id: number;
    days: number;
  }): Promise<StationForecast> {
    const station = await this.stations.findById(input.station_id);
    if (!station) throw new StationNotFoundError();
    if (station.latitude === null || station.longitude === null) {
      throw new StationWithoutCoordinatesError();
    }

    const query = {
      latitude: station.latitude,
      longitude: station.longitude,
      days: input.days,
    };
    let days;
    try {
      days = await this.provider.daily(query);
    } catch (error) {
      // Só falha do provedor vira 503; erro nosso sobe como 500.
      if (!(error instanceof ForecastProviderError)) throw error;
      this.onProviderError(error, { ...query, station_id: station.id });
      throw new ForecastUnavailableError({ cause: error });
    }

    return {
      station_id: station.id,
      latitude: station.latitude,
      longitude: station.longitude,
      source: this.provider.source,
      generated_at: this.clock(),
      days,
    };
  }
}
