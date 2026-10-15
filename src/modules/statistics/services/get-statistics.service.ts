import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import { InvalidPeriodError } from "@/modules/statistics/errors/invalid-period.error.js";
import type { StatisticsRepository } from "@/modules/statistics/repositories/statistics.repository.js";
import type { Statistics } from "@/modules/statistics/types/statistics.type.js";

type Clock = () => Date;

export const DEFAULT_PERIOD_DAYS = 7;
export const MAX_PERIOD_DAYS = 366;
/** Sem estação nem propriedade a consulta varre todas as leituras. */
export const MAX_GLOBAL_PERIOD_DAYS = 31;
const DAY_MS = 86_400_000;

export type StatisticsInput = {
  station_id?: number | undefined;
  property_id?: number | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
};

/**
 * Estatísticas dos dados meteorológicos por tipo de sensor (US11).
 * Sem período informado, usa os últimos 7 dias até agora. Até 366 dias
 * por estação ou propriedade; 31 dias para todas as estações.
 */
export class GetStatisticsService {
  constructor(
    private readonly repository: StatisticsRepository,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async execute(input: StatisticsInput): Promise<Statistics> {
    const to = input.to ?? this.clock();
    const from =
      input.from ?? new Date(to.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS);

    if (from.getTime() >= to.getTime()) {
      throw new InvalidPeriodError("from must be earlier than to.");
    }
    const scoped =
      input.station_id !== undefined || input.property_id !== undefined;
    const maxDays = scoped ? MAX_PERIOD_DAYS : MAX_GLOBAL_PERIOD_DAYS;
    if (to.getTime() - from.getTime() > maxDays * DAY_MS) {
      throw new InvalidPeriodError(
        scoped
          ? `The period must be at most ${MAX_PERIOD_DAYS} days.`
          : `Without station_id or property_id the period must be at most ${MAX_GLOBAL_PERIOD_DAYS} days.`,
      );
    }
    if (
      input.station_id !== undefined &&
      !(await this.repository.stationExists(input.station_id))
    ) {
      throw new StationNotFoundError();
    }

    const sensorTypes = await this.repository.summarize({
      station_id: input.station_id,
      property_id: input.property_id,
      from_unix: Math.floor(from.getTime() / 1000),
      to_unix: Math.ceil(to.getTime() / 1000),
    });

    return {
      from,
      to,
      station_id: input.station_id ?? null,
      property_id: input.property_id ?? null,
      readings_total: sensorTypes.reduce((sum, s) => sum + s.count, 0),
      sensor_types: sensorTypes,
    };
  }
}
