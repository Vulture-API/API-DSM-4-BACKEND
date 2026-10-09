import type { MonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import { stationStatus } from "@/modules/monitoring/services/station-status.js";
import type {
  Overview,
  OverviewStatus,
} from "@/modules/monitoring/types/monitoring.type.js";

type Clock = () => Date;

/**
 * Visão geral das estações para o dashboard (US04): status de comunicação,
 * sensores, alertas pendentes e a última leitura de cada sensor.
 */
export class GetOverviewService {
  constructor(
    private readonly repository: MonitoringRepository,
    private readonly offlineThresholdMinutes: number,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async execute(filters: {
    property_id?: number | undefined;
  }): Promise<Overview> {
    const now = this.clock();
    const snapshots = await this.repository.listSnapshots(filters.property_id);
    const stations = snapshots.map((s) => ({
      ...s,
      status: stationStatus(
        s.last_communication_at,
        s.active_alerts,
        now,
        this.offlineThresholdMinutes,
      ),
    }));

    const count = (status: OverviewStatus) =>
      stations.filter((s) => s.status === status).length;

    return {
      generated_at: now,
      offline_threshold_minutes: this.offlineThresholdMinutes,
      summary: {
        total: stations.length,
        online: count("Online"),
        with_alert: count("Com alerta"),
        offline: count("Offline"),
      },
      stations,
    };
  }
}
