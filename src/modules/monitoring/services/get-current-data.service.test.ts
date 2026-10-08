import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryMonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import { GetCurrentDataService } from "@/modules/monitoring/services/get-current-data.service.js";
import type { StationCurrentRow } from "@/modules/monitoring/types/monitoring.type.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";

const now = new Date("2026-09-25T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const unix = (date: Date) => Math.floor(date.getTime() / 1000);

function row(
  id: number,
  lastCommunication: Date | null,
  overrides: Partial<StationCurrentRow> = {},
): StationCurrentRow {
  return {
    id,
    name: `Estação ${id}`,
    property_id: id % 2 === 0 ? 2 : 1,
    property_name: "Fazenda",
    last_communication_at: lastCommunication,
    active_alerts: 0,
    readings: [],
    ...overrides,
  };
}

describe("GetCurrentDataService", () => {
  let repository: InMemoryMonitoringRepository;
  let service: GetCurrentDataService;

  beforeEach(() => {
    repository = new InMemoryMonitoringRepository();
    service = new GetCurrentDataService(repository, 10, () => now);
  });

  it("devolve as leituras atuais com status e última atualização", async () => {
    repository.current = [
      row(1, minutesAgo(2), {
        readings: [
          {
            sensor_id: 10,
            local_identifier: "temp",
            sensor_type_id: 1,
            sensor_type: "Temperatura",
            unit_of_measure: "°C",
            value: 24.5,
            unix_time: unix(minutesAgo(5)),
          },
          {
            sensor_id: 11,
            local_identifier: "umid",
            sensor_type_id: 2,
            sensor_type: "Umidade",
            unit_of_measure: "%",
            value: 61,
            unix_time: unix(minutesAgo(2)),
          },
        ],
      }),
    ];

    const result = await service.execute({});

    expect(result.generated_at).toEqual(now);
    expect(result.offline_threshold_minutes).toBe(10);
    expect(result.stations).toHaveLength(1);
    expect(result.stations[0]).toMatchObject({
      station_id: 1,
      name: "Estação 1",
      status: "Online",
      last_update: minutesAgo(2),
    });
    expect(result.stations[0]!.readings).toHaveLength(2);
  });

  it("calcula Offline e Com alerta como no overview", async () => {
    repository.current = [
      row(1, minutesAgo(11)),
      row(2, minutesAgo(1), { active_alerts: 1 }),
      row(3, null),
    ];

    const result = await service.execute({});

    expect(result.stations.map((s) => s.status)).toEqual([
      "Offline",
      "Com alerta",
      "Offline",
    ]);
  });

  it("deixa last_update nulo quando nenhum sensor tem leitura", async () => {
    repository.current = [
      row(1, null, {
        readings: [
          {
            sensor_id: 10,
            local_identifier: "temp",
            sensor_type_id: 1,
            sensor_type: "Temperatura",
            unit_of_measure: "°C",
            value: null,
            unix_time: null,
          },
        ],
      }),
    ];

    const result = await service.execute({});

    expect(result.stations[0]!.last_update).toBeNull();
    expect(result.stations[0]!.readings[0]!.value).toBeNull();
  });

  it("filtra por estação e por propriedade", async () => {
    repository.current = [row(1, null), row(2, null), row(3, null)];

    expect(
      (await service.execute({ station_id: 2 })).stations.map(
        (s) => s.station_id,
      ),
    ).toEqual([2]);
    expect(
      (await service.execute({ property_id: 1 })).stations.map(
        (s) => s.station_id,
      ),
    ).toEqual([1, 3]);
  });

  it("recusa estação inexistente com 404", async () => {
    await expect(service.execute({ station_id: 99 })).rejects.toBeInstanceOf(
      StationNotFoundError,
    );
  });

  it("devolve lista vazia sem estações", async () => {
    const result = await service.execute({});

    expect(result.stations).toEqual([]);
  });
});
