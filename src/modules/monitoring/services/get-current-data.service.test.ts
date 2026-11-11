import { beforeEach, describe, expect, it, vi } from "vitest";

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
      row(1, minutesAgo(1), {
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

  it("usa a leitura mais recente como última atualização, ignorando sensores sem dado", async () => {
    repository.current = [
      row(1, minutesAgo(1), {
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
          {
            sensor_id: 11,
            local_identifier: "umid",
            sensor_type_id: 2,
            sensor_type: "Umidade",
            unit_of_measure: "%",
            value: 60,
            unix_time: unix(minutesAgo(7)),
          },
        ],
      }),
    ];

    const result = await service.execute({});

    expect(result.stations[0]!.last_update).toEqual(minutesAgo(7));
  });

  it("devolve lista vazia sem estações", async () => {
    const result = await service.execute({});

    expect(result.stations).toEqual([]);
  });

  it("preserva os dados de cada estação e não mistura suas atualizações", async () => {
    const reading = {
      sensor_id: 10,
      local_identifier: "temp",
      sensor_type_id: 1,
      sensor_type: "Temperatura",
      unit_of_measure: "°C",
      value: 0,
      unix_time: 0,
    };
    repository.current = [
      row(1, minutesAgo(1), { readings: [reading] }),
      row(2, minutesAgo(2), {
        readings: [
          {
            ...reading,
            sensor_id: 20,
            value: -5,
            unix_time: unix(minutesAgo(3)),
          },
        ],
      }),
      row(3, minutesAgo(1)),
    ];
    const original = structuredClone(repository.current);

    const result = await service.execute({});

    expect(result.stations).toEqual([
      {
        station_id: 1,
        name: "Estação 1",
        property_id: 1,
        property_name: "Fazenda",
        status: "Online",
        last_update: new Date(0),
        readings: [reading],
      },
      {
        station_id: 2,
        name: "Estação 2",
        property_id: 2,
        property_name: "Fazenda",
        status: "Online",
        last_update: minutesAgo(3),
        readings: original[1]!.readings,
      },
      {
        station_id: 3,
        name: "Estação 3",
        property_id: 1,
        property_name: "Fazenda",
        status: "Online",
        last_update: null,
        readings: [],
      },
    ]);
    expect(repository.current).toEqual(original);
  });

  it("encaminha os filtros combinados e aceita estação existente sem leituras", async () => {
    repository.current = [row(1, null), row(2, null)];
    const list = vi.spyOn(repository, "listCurrent");
    const exists = vi.spyOn(repository, "stationExists");

    expect(
      (await service.execute({ station_id: 2, property_id: 2 })).stations,
    ).toHaveLength(1);
    expect(exists).toHaveBeenCalledWith(2);
    expect(list).toHaveBeenCalledWith({ station_id: 2, property_id: 2 });
    expect(
      (await service.execute({ station_id: 2, property_id: 1 })).stations,
    ).toEqual([]);
  });

  it("não consulta leituras quando a estação não existe", async () => {
    const list = vi.spyOn(repository, "listCurrent");
    await expect(service.execute({ station_id: 99 })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(list).not.toHaveBeenCalled();
  });

  it("considera online a comunicação exatamente no limite e prioriza offline sobre alerta", async () => {
    repository.current = [
      row(1, minutesAgo(10)),
      row(2, minutesAgo(10 + 1 / 60), { active_alerts: 1 }),
    ];
    expect((await service.execute({})).stations.map((s) => s.status)).toEqual([
      "Online",
      "Offline",
    ]);
  });

  it.each(["listCurrent", "stationExists"] as const)(
    "propaga falha de %s sem produzir dados parciais",
    async (method) => {
      const failure = new Error("Falha do repositório fake");
      vi.spyOn(repository, method).mockRejectedValueOnce(failure);
      await expect(
        service.execute(method === "stationExists" ? { station_id: 1 } : {}),
      ).rejects.toBe(failure);
    },
  );
});
