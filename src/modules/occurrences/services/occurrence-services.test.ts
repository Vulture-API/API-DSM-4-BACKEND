import { describe, expect, it, vi } from "vitest";

import {
  InvalidOccurrencePeriodError,
  OccurrenceAlreadyResolvedError,
  OccurrenceNotFoundError,
} from "@/modules/occurrences/errors/occurrence.errors.js";
import { CheckSensorLimitsService } from "@/modules/occurrences/services/check-sensor-limits.service.js";
import { DetectCommunicationFailuresService } from "@/modules/occurrences/services/detect-communication-failures.service.js";
import { OccurrenceQueryService } from "@/modules/occurrences/services/occurrence-query.service.js";
import { evaluateLimits } from "@/modules/occurrences/services/sensor-limits.js";
import { InMemoryOccurrenceRepository } from "@/modules/occurrences/testing/in-memory-occurrence.repository.js";
import type { ReadingWithLimits } from "@/modules/occurrences/types/occurrence.type.js";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000);

describe("evaluateLimits (SCRUM-424)", () => {
  it("aceita dentro da faixa, nos limites e sem limite configurado", () => {
    expect(evaluateLimits(20, 0, 50)).toBeNull();
    expect(evaluateLimits(0, 0, 50)).toBeNull();
    expect(evaluateLimits(50, 0, 50)).toBeNull();
    expect(evaluateLimits(1e6, null, null)).toBeNull();
    expect(evaluateLimits(-5, null, 10)).toBeNull();
  });

  it("identifica valores abaixo do mínimo e acima do máximo", () => {
    expect(evaluateLimits(-0.01, 0, 50)).toBe("BELOW_MIN");
    expect(evaluateLimits(50.01, 0, 50)).toBe("ABOVE_MAX");
    expect(evaluateLimits(11, null, 10)).toBe("ABOVE_MAX");
  });
});

describe("DetectCommunicationFailuresService (SCRUM-423)", () => {
  const setup = () => {
    const repository = new InMemoryOccurrenceRepository();
    const service = new DetectCommunicationFailuresService(
      repository,
      10,
      () => NOW,
    );
    return { repository, service };
  };

  it("abre falha para estação calada além do limite e ignora as que comunicam", async () => {
    const { repository, service } = setup();
    repository.stations = [
      {
        station_id: 1,
        station_name: "Norte",
        last_communication_at: minutesAgo(30),
        created_at: minutesAgo(1000),
      },
      {
        station_id: 2,
        station_name: "Sul",
        last_communication_at: minutesAgo(10),
        created_at: minutesAgo(1000),
      },
    ];

    expect(await service.execute()).toEqual({
      stations_checked: 2,
      failures_opened: 1,
      failures_resolved: 0,
    });
    expect(repository.occurrences).toHaveLength(1);
    expect(repository.occurrences[0]).toMatchObject({
      type: "COMMUNICATION_FAILURE",
      status: "OPEN",
      station_id: 1,
      sensor_id: null,
      detected_at: NOW.toISOString(),
    });
    expect(repository.occurrences[0]!.description).toContain("há 30 min");
  });

  it("estação sem histórico conta a partir do cadastro", async () => {
    const { repository, service } = setup();
    repository.stations = [
      {
        station_id: 1,
        station_name: "Nova",
        last_communication_at: null,
        created_at: minutesAgo(5),
      },
      {
        station_id: 2,
        station_name: "Antiga",
        last_communication_at: null,
        created_at: minutesAgo(60),
      },
    ];

    await service.execute();
    expect(repository.occurrences.map((o) => o.station_id)).toEqual([2]);
    expect(repository.occurrences[0]!.description).toContain(
      "sem nenhuma comunicação registrada",
    );
  });

  it("não duplica a falha aberta e resolve quando a estação volta", async () => {
    const { repository, service } = setup();
    repository.stations = [
      {
        station_id: 1,
        station_name: "Norte",
        last_communication_at: minutesAgo(30),
        created_at: minutesAgo(1000),
      },
    ];
    await service.execute();
    expect((await service.execute()).failures_opened).toBe(0);
    expect(repository.occurrences).toHaveLength(1);

    repository.stations[0]!.last_communication_at = minutesAgo(1);
    expect(await service.execute()).toMatchObject({ failures_resolved: 1 });
    expect(repository.occurrences[0]).toMatchObject({
      status: "RESOLVED",
      resolved_at: NOW.toISOString(),
    });

    repository.stations[0]!.last_communication_at = minutesAgo(11);
    expect((await service.execute()).failures_opened).toBe(1);
    expect(repository.occurrences).toHaveLength(2);
  });

  it("não conta como aberta quando outra instância já abriu a falha", async () => {
    const { repository, service } = setup();
    repository.stations = [
      {
        station_id: 1,
        station_name: "Norte",
        last_communication_at: minutesAgo(30),
        created_at: minutesAgo(1000),
      },
    ];
    vi.spyOn(repository, "openCommunicationFailure").mockResolvedValue(false);
    expect((await service.execute()).failures_opened).toBe(0);
  });
});

describe("CheckSensorLimitsService (SCRUM-424)", () => {
  const reading = (
    id: number,
    value: number,
    overrides: Partial<ReadingWithLimits> = {},
  ): ReadingWithLimits => ({
    reading_id: id,
    sensor_id: 10,
    station_id: 1,
    sensor_identifier: "temp",
    value,
    unix_time: 1_790_000_000 + id,
    data_consistent: true,
    min_value: -10,
    max_value: 50,
    ...overrides,
  });

  it("sem leituras novas mantém o checkpoint", async () => {
    const repository = new InMemoryOccurrenceRepository();
    repository.checkpoint = 7;
    const service = new CheckSensorLimitsService(repository);
    expect(await service.execute()).toEqual({
      readings_checked: 0,
      out_of_range: 0,
      last_reading_id: 7,
    });
  });

  it("marca fora da faixa como inconsistente, abre uma ocorrência por sensor e avança o checkpoint", async () => {
    const repository = new InMemoryOccurrenceRepository();
    repository.readings = [
      reading(1, 20),
      reading(2, 70),
      reading(3, 80),
      reading(4, -20, { sensor_id: 11, sensor_identifier: "umid" }),
      reading(5, 999, { min_value: null, max_value: null }),
      reading(6, 999, { data_consistent: false }),
    ];
    const service = new CheckSensorLimitsService(repository, {
      clock: () => NOW,
    });

    expect(await service.execute()).toEqual({
      readings_checked: 6,
      out_of_range: 3,
      last_reading_id: 6,
    });
    expect(repository.checkpoint).toBe(6);
    expect(
      repository.readings
        .filter((r) => !r.data_consistent)
        .map((r) => r.reading_id),
    ).toEqual([2, 3, 4, 6]);
    expect(
      repository.occurrences.map((o) => [o.sensor_id, o.reading_id, o.value]),
    ).toEqual([
      [10, 2, 70],
      [11, 4, -20],
    ]);
    expect(repository.occurrences[0]!.description).toBe(
      "Sensor temp: valor 70 acima do máximo 50 configurado.",
    );
    expect(repository.occurrences[1]!.description).toContain(
      "abaixo do mínimo -10",
    );
  });

  it("respeita o tamanho do lote", async () => {
    const repository = new InMemoryOccurrenceRepository();
    repository.readings = [reading(1, 1), reading(2, 2), reading(3, 3)];
    const service = new CheckSensorLimitsService(repository, { batchSize: 2 });
    expect((await service.execute()).last_reading_id).toBe(2);
    expect((await service.execute()).last_reading_id).toBe(3);
  });
});

describe("OccurrenceQueryService (SCRUM-425)", () => {
  const seeded = async () => {
    const repository = new InMemoryOccurrenceRepository();
    repository.stations = [
      {
        station_id: 1,
        station_name: "Norte",
        last_communication_at: null,
        created_at: minutesAgo(100),
      },
    ];
    await repository.openCommunicationFailure({
      station_id: 1,
      description: "x",
      detected_at: minutesAgo(20),
    });
    return {
      repository,
      service: new OccurrenceQueryService(repository, () => NOW),
    };
  };

  it("lista com filtros e recusa período invertido", async () => {
    const { service } = await seeded();
    const page = await service.list({ page: 1, limit: 20, station_id: 1 });
    expect(page.meta.total_records).toBe(1);
    expect(page.data[0]).toMatchObject({ station_name: "Norte" });
    expect(
      (await service.list({ page: 1, limit: 20, from: minutesAgo(5) })).data,
    ).toHaveLength(0);
    await expect(
      service.list({ page: 1, limit: 20, from: NOW, to: minutesAgo(1) }),
    ).rejects.toBeInstanceOf(InvalidOccurrencePeriodError);
  });

  it("busca, resolve e recusa resolver de novo", async () => {
    const { service } = await seeded();
    await expect(service.get(99)).rejects.toBeInstanceOf(
      OccurrenceNotFoundError,
    );
    expect(await service.resolve(1)).toMatchObject({
      status: "RESOLVED",
      resolved_at: NOW.toISOString(),
    });
    await expect(service.resolve(1)).rejects.toBeInstanceOf(
      OccurrenceAlreadyResolvedError,
    );
  });

  it("trata resolução concorrente como já resolvida", async () => {
    const { repository, service } = await seeded();
    vi.spyOn(repository, "resolve").mockResolvedValue(null);
    await expect(service.resolve(1)).rejects.toBeInstanceOf(
      OccurrenceAlreadyResolvedError,
    );
  });
});
