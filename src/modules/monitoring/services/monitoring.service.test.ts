import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryMonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import { GetOverviewService } from "@/modules/monitoring/services/get-overview.service.js";
import { GetReadingSeriesService } from "@/modules/monitoring/services/get-reading-series.service.js";
import type { StationSnapshot } from "@/modules/monitoring/types/monitoring.type.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";

const now = new Date("2026-09-25T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

function snapshot(
  id: number,
  lastCommunication: Date | null,
  activeAlerts = 0,
): StationSnapshot {
  return {
    id,
    name: `Estação ${id}`,
    mac_address: `AA:BB:CC:DD:EE:0${id}`,
    property_id: id % 2 === 0 ? 2 : 1,
    property_name: "Fazenda",
    latitude: null,
    longitude: null,
    last_communication_at: lastCommunication,
    sensors_total: 5,
    sensors_active: 5,
    active_alerts: activeAlerts,
    latest_readings: [],
  };
}

describe("GetOverviewService", () => {
  let repository: InMemoryMonitoringRepository;
  let service: GetOverviewService;

  beforeEach(() => {
    repository = new InMemoryMonitoringRepository();
    service = new GetOverviewService(repository, 10, () => now);
  });

  it("classifica Online, Com alerta e Offline e soma o resumo", async () => {
    repository.snapshots = [
      snapshot(1, minutesAgo(2)),
      snapshot(2, minutesAgo(5), 3),
      snapshot(3, minutesAgo(45), 1),
      snapshot(4, null),
    ];

    const overview = await service.execute({});

    expect(overview.stations.map((s) => s.status)).toEqual([
      "Online",
      "Com alerta",
      "Offline",
      "Offline",
    ]);
    expect(overview.summary).toEqual({
      total: 4,
      online: 1,
      with_alert: 1,
      offline: 2,
    });
    expect(overview.generated_at).toEqual(now);
    expect(overview.offline_threshold_minutes).toBe(10);
  });

  it("filtra por propriedade", async () => {
    repository.snapshots = [snapshot(1, null), snapshot(2, null)];

    const overview = await service.execute({ property_id: 2 });

    expect(overview.stations.map((s) => s.id)).toEqual([2]);
  });
});

describe("GetReadingSeriesService", () => {
  let repository: InMemoryMonitoringRepository;
  let service: GetReadingSeriesService;

  beforeEach(() => {
    repository = new InMemoryMonitoringRepository();
    service = new GetReadingSeriesService(repository, () => now);
  });

  it("calcula a janela e o intervalo a partir de horas e minutos", async () => {
    const result = await service.execute({ hours: 24, bucket_minutes: 60 });

    expect(repository.lastSeriesFilters).toEqual({
      station_id: undefined,
      property_id: undefined,
      from_unix: now.getTime() / 1000 - 24 * 3600,
      bucket_seconds: 3600,
    });
    expect(result.from).toEqual(new Date(now.getTime() - 24 * 3_600_000));
    expect(result.to).toEqual(now);
    expect(result.bucket_minutes).toBe(60);
  });

  it("recusa estação inexistente com 404", async () => {
    await expect(
      service.execute({ station_id: 99, hours: 24, bucket_minutes: 60 }),
    ).rejects.toBeInstanceOf(StationNotFoundError);
  });

  it("aceita estação existente", async () => {
    repository.snapshots = [snapshot(7, null)];

    await service.execute({ station_id: 7, hours: 6, bucket_minutes: 10 });

    expect(repository.lastSeriesFilters?.station_id).toBe(7);
    expect(repository.lastSeriesFilters?.bucket_seconds).toBe(600);
  });
});
