import type { MonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import type { ReadingSeries } from "@/modules/monitoring/types/monitoring.type.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";

type Clock = () => Date;

export type ReadingSeriesInput = {
  station_id?: number | undefined;
  property_id?: number | undefined;
  hours: number;
  bucket_minutes: number;
};

/** Série temporal agregada (média, mínimo e máximo) por tipo de sensor. */
export class GetReadingSeriesService {
  constructor(
    private readonly repository: MonitoringRepository,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async execute(input: ReadingSeriesInput): Promise<ReadingSeries> {
    if (
      input.station_id !== undefined &&
      !(await this.repository.stationExists(input.station_id))
    ) {
      throw new StationNotFoundError();
    }

    const to = this.clock();
    const from = new Date(to.getTime() - input.hours * 3_600_000);
    const series = await this.repository.readingSeries({
      station_id: input.station_id,
      property_id: input.property_id,
      from_unix: Math.floor(from.getTime() / 1000),
      bucket_seconds: input.bucket_minutes * 60,
    });

    return { from, to, bucket_minutes: input.bucket_minutes, series };
  }
}
