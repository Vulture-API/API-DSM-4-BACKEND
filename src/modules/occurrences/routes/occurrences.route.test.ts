import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import { CheckSensorLimitsService } from "@/modules/occurrences/services/check-sensor-limits.service.js";
import { DetectCommunicationFailuresService } from "@/modules/occurrences/services/detect-communication-failures.service.js";
import { OccurrenceMonitorWorker } from "@/modules/occurrences/services/occurrence-monitor.worker.js";
import { InMemoryOccurrenceRepository } from "@/modules/occurrences/testing/in-memory-occurrence.repository.js";

const NOW = new Date("2026-10-14T12:00:00.000Z");

describe("rotas de ocorrências (SCRUM-425)", () => {
  let app: FastifyInstance;
  let repository: InMemoryOccurrenceRepository;
  let worker: OccurrenceMonitorWorker;

  beforeEach(() => {
    repository = new InMemoryOccurrenceRepository();
    repository.stations = [
      {
        station_id: 1,
        station_name: "Norte",
        last_communication_at: new Date(NOW.getTime() - 3_600_000),
        created_at: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    repository.readings = [
      {
        reading_id: 5,
        sensor_id: 10,
        station_id: 1,
        sensor_identifier: "temp",
        value: 70,
        unix_time: 1_790_000_000,
        data_consistent: true,
        min_value: null,
        max_value: 50,
      },
    ];
    worker = new OccurrenceMonitorWorker(
      new DetectCommunicationFailuresService(repository, 10, () => NOW),
      new CheckSensorLimitsService(repository, { clock: () => NOW }),
      { intervalMs: 60_000 },
    );
    app = buildApp({
      occurrenceRepository: repository,
      occurrenceMonitorWorker: worker,
      clock: () => NOW,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("verificação manual registra as ocorrências e a listagem as devolve", async () => {
    const run = await app.inject({
      method: "POST",
      url: "/internal/occurrences/run",
    });
    expect(run.statusCode).toBe(200);
    expect(run.json()).toMatchObject({
      communication: { failures_opened: 1 },
      limits: { out_of_range: 1, last_reading_id: 5 },
    });

    const list = await app.inject({ method: "GET", url: "/api/occurrences" });
    expect(list.statusCode).toBe(200);
    expect(list.json().meta).toEqual({
      total_records: 2,
      total_pages: 1,
      current_page: 1,
    });

    const filtered = await app.inject({
      method: "GET",
      url: "/api/occurrences?type=OUT_OF_RANGE&status=OPEN&station_id=1&from=2026-10-14T08:00:00-03:00",
    });
    expect(filtered.json().data).toEqual([
      expect.objectContaining({
        type: "OUT_OF_RANGE",
        sensor_id: 10,
        reading_id: 5,
        value: 70,
      }),
    ]);
  });

  it("busca por id, resolve e responde 404/409", async () => {
    await app.inject({ method: "POST", url: "/internal/occurrences/run" });

    expect(
      (await app.inject({ method: "GET", url: "/api/occurrences/1" })).json(),
    ).toMatchObject({ id: 1, status: "OPEN" });
    expect(
      (await app.inject({ method: "GET", url: "/api/occurrences/99" }))
        .statusCode,
    ).toBe(404);

    const resolved = await app.inject({
      method: "PATCH",
      url: "/api/occurrences/1/resolve",
    });
    expect(resolved.json()).toMatchObject({
      status: "RESOLVED",
      resolved_at: NOW.toISOString(),
    });
    const again = await app.inject({
      method: "PATCH",
      url: "/api/occurrences/1/resolve",
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe("OCCURRENCE_ALREADY_RESOLVED");
  });

  it("valida filtros e período", async () => {
    for (const query of [
      "type=OUTRO",
      "from=2026-10-14T08:00:00",
      "station_id=0",
    ]) {
      const response = await app.inject({
        method: "GET",
        url: `/api/occurrences?${query}`,
      });
      expect(response.statusCode).toBe(400);
    }
    const inverted = await app.inject({
      method: "GET",
      url: "/api/occurrences?from=2026-10-14T00:00:00Z&to=2026-10-13T00:00:00Z",
    });
    expect(inverted.json().code).toBe("INVALID_PERIOD");
  });

  it("indica o monitor no healthcheck", async () => {
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.json()).toMatchObject({ occurrence_monitor: false });
  });
});

describe("verificação manual sem monitor anexado", () => {
  it("responde 503 e 409 quando ocupado", async () => {
    const app = buildApp({
      occurrenceRepository: new InMemoryOccurrenceRepository(),
    });
    const unavailable = await app.inject({
      method: "POST",
      url: "/internal/occurrences/run",
    });
    expect(unavailable.statusCode).toBe(503);
    await app.close();

    const busyWorker = {
      runOnce: async () => null,
      stop: async () => undefined,
      isRunning: true,
    } as unknown as OccurrenceMonitorWorker;
    const busy = buildApp({
      occurrenceRepository: new InMemoryOccurrenceRepository(),
      occurrenceMonitorWorker: busyWorker,
    });
    expect(
      (await busy.inject({ method: "POST", url: "/internal/occurrences/run" }))
        .statusCode,
    ).toBe(409);
    await busy.close();
  });
});
