import type { MonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import { stationStatus } from "@/modules/monitoring/services/station-status.js";
import type {
  CurrentData,
  CurrentFilters,
  StationCurrentRow,
} from "@/modules/monitoring/types/monitoring.type.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";

type Clock = () => Date;

/** Dados meteorológicos atuais (US07): última leitura consistente por sensor. */
export class GetCurrentDataService {
  constructor(
    private readonly repository: MonitoringRepository,
    private readonly offlineThresholdMinutes: number,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async execute(filters: CurrentFilters): Promise<CurrentData> {
    if (
      filters.station_id !== undefined &&
      !(await this.repository.stationExists(filters.station_id))
    ) {
      throw new StationNotFoundError();
    }

    const now = this.clock();
    const rows = await this.repository.listCurrent(filters);

    return {
      generated_at: now,
      offline_threshold_minutes: this.offlineThresholdMinutes,
      stations: rows.map((row) => ({
        station_id: row.id,
        name: row.name,
        property_id: row.property_id,
        property_name: row.property_name,
        status: stationStatus(
          row.last_communication_at,
          row.active_alerts,
          now,
          this.offlineThresholdMinutes,
        ),
        last_update: lastUpdate(row),
        readings: row.readings,
      })),
    };
  }
}

function lastUpdate(row: StationCurrentRow): Date | null {
  const times = row.readings
    .map((r) => r.unix_time)
    .filter((t): t is number => t !== null);
  return times.length > 0 ? new Date(Math.max(...times) * 1000) : null;
}
