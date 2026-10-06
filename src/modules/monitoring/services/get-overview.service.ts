import type { MonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import type {
  Overview,
  OverviewStatus,
  StationSnapshot,
} from "@/modules/monitoring/types/monitoring.type.js";

type Clock = () => Date;

/**
 * Visão geral das estações para o dashboard (US04): status de comunicação,
 * sensores, alertas pendentes e a última leitura de cada sensor.
 *
 * Status: Offline se a última comunicação passou do limite (ou nunca houve);
 * senão "Com alerta" se há alerta não reconhecido; senão Online. Mesmo limite
 * do GET /api/stations/:id/status.
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
      status: this.statusOf(s, now),
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

  private statusOf(station: StationSnapshot, now: Date): OverviewStatus {
    const limitMs = this.offlineThresholdMinutes * 60_000;
    const last = station.last_communication_at;
    if (!last || now.getTime() - last.getTime() > limitMs) return "Offline";
    return station.active_alerts > 0 ? "Com alerta" : "Online";
  }
}
