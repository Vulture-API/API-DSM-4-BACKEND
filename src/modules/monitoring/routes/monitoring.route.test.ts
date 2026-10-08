import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import { InMemoryMonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import { ReadingsBroadcaster } from "@/modules/monitoring/services/readings-broadcaster.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";

describe("rotas de monitoramento", () => {
  const now = new Date("2026-09-25T12:00:00.000Z");
  let app: FastifyInstance;
  let monitoring: InMemoryMonitoringRepository;

  beforeEach(async () => {
    monitoring = new InMemoryMonitoringRepository();
    monitoring.snapshots = [
      {
        id: 1,
        name: "Estação 1",
        mac_address: "AA:BB:CC:DD:EE:01",
        property_id: 1,
        property_name: "Fazenda",
        latitude: -23.1,
        longitude: -45.9,
        last_communication_at: new Date("2026-09-25T11:58:00.000Z"),
        sensors_total: 2,
        sensors_active: 2,
        active_alerts: 0,
        latest_readings: [
          {
            sensor_id: 10,
            local_identifier: "temp",
            sensor_type_id: 3,
            sensor_type: "Temperatura",
            unit_of_measure: "°C",
            value: 24.5,
            unix_time: 1790337480,
          },
        ],
      },
    ];
    monitoring.current = [
      {
        id: 1,
        name: "Estação 1",
        property_id: 1,
        property_name: "Fazenda",
        last_communication_at: new Date("2026-09-25T11:58:00.000Z"),
        active_alerts: 0,
        readings: [
          {
            sensor_id: 10,
            local_identifier: "temp",
            sensor_type_id: 3,
            sensor_type: "Temperatura",
            unit_of_measure: "°C",
            value: 24.5,
            unix_time: 1790337480,
          },
        ],
      },
    ];
    monitoring.series = [
      {
        sensor_type_id: 3,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        points: [{ t: 1790334000, avg: 24, min: 22, max: 26 }],
      },
    ];
    app = buildApp({
      stationRepository: new InMemoryStationRepository(),
      monitoringRepository: monitoring,
      stationOfflineThresholdMinutes: 10,
      clock: () => now,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/stations/overview devolve resumo e estações", async () => {
    const response = await app.inject("/api/stations/overview");

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.summary).toEqual({
      total: 1,
      online: 1,
      with_alert: 0,
      offline: 0,
    });
    expect(body.stations[0]).toMatchObject({
      id: 1,
      status: "Online",
      last_communication_at: "2026-09-25T11:58:00.000Z",
      latest_readings: [{ sensor_type: "Temperatura", value: 24.5 }],
    });
  });

  it("GET /api/stations/readings/series usa os padrões 24h / 60 min", async () => {
    const response = await app.inject("/api/stations/readings/series");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      bucket_minutes: 60,
      from: "2026-09-24T12:00:00.000Z",
      series: [{ sensor_type: "Temperatura", points: [{ avg: 24 }] }],
    });
    expect(monitoring.lastSeriesFilters?.bucket_seconds).toBe(3600);
  });

  it("valida os parâmetros da série", async () => {
    const response = await app.inject(
      "/api/stations/readings/series?hours=0&bucket_minutes=1",
    );

    expect(response.statusCode).toBe(400);

    // 30 dias em intervalos de 5 min = 8.640 pontos: acima do limite.
    const tooMany = await app.inject(
      "/api/stations/readings/series?hours=720&bucket_minutes=5",
    );
    expect(tooMany.statusCode).toBe(400);
    const stationTooMany = await app.inject(
      "/api/stations/1/readings/series?hours=720&bucket_minutes=5",
    );
    expect(stationTooMany.statusCode).toBe(400);
    const ok = await app.inject(
      "/api/stations/readings/series?hours=720&bucket_minutes=1440",
    );
    expect(ok.statusCode).toBe(200);
  });

  it("GET /api/stations/:id/readings/series filtra pela estação", async () => {
    const ok = await app.inject(
      "/api/stations/1/readings/series?hours=6&bucket_minutes=10",
    );
    expect(ok.statusCode).toBe(200);
    expect(monitoring.lastSeriesFilters?.station_id).toBe(1);

    const missing = await app.inject("/api/stations/99/readings/series");
    expect(missing.statusCode).toBe(404);
  });

  it("não conflita com GET /api/stations/:id", async () => {
    const response = await app.inject("/api/stations/overview");

    expect(response.statusCode).not.toBe(400);
  });

  it("GET /api/stations/current devolve os dados atuais", async () => {
    const response = await app.inject("/api/stations/current");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      generated_at: "2026-09-25T12:00:00.000Z",
      offline_threshold_minutes: 10,
      stations: [
        {
          station_id: 1,
          status: "Online",
          last_update: "2026-09-25T11:58:00.000Z",
          readings: [{ sensor_type: "Temperatura", value: 24.5 }],
        },
      ],
    });
  });

  it("GET /api/stations/current filtra por propriedade e valida os filtros", async () => {
    const other = await app.inject("/api/stations/current?property_id=2");
    expect(other.statusCode).toBe(200);
    expect(other.json().stations).toEqual([]);

    const invalid = await app.inject("/api/stations/current?station_id=abc");
    expect(invalid.statusCode).toBe(400);

    const missing = await app.inject("/api/stations/current?station_id=99");
    expect(missing.statusCode).toBe(404);
  });

  it("GET /api/stations/:id/current devolve uma estação ou 404", async () => {
    const ok = await app.inject("/api/stations/1/current");
    expect(ok.statusCode).toBe(200);
    expect(ok.json().stations).toHaveLength(1);

    const missing = await app.inject("/api/stations/99/current");
    expect(missing.statusCode).toBe(404);
  });
});

describe("WebSocket de leituras atuais", () => {
  let app: FastifyInstance;
  let monitoring: InMemoryMonitoringRepository;
  let broadcaster: ReadingsBroadcaster;

  beforeEach(async () => {
    monitoring = new InMemoryMonitoringRepository();
    monitoring.current = [1, 2].map((id) => ({
      id,
      name: `Estação ${id}`,
      property_id: 1,
      property_name: "Fazenda",
      last_communication_at: null,
      active_alerts: 0,
      readings: [],
    }));
    broadcaster = new ReadingsBroadcaster(monitoring, { intervalMs: 10 });
    app = buildApp({
      stationRepository: new InMemoryStationRepository(),
      monitoringRepository: monitoring,
      readingsBroadcaster: broadcaster,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const live = (id: number, stationId: number) => ({
    reading_id: id,
    station_id: stationId,
    sensor_id: 10,
    local_identifier: "temp",
    sensor_type_id: 1,
    sensor_type: "Temperatura",
    unit_of_measure: "°C",
    value: 21.5,
    unix_time: 1_790_000_000,
  });

  const waitFor = async (check: () => boolean) => {
    for (let i = 0; i < 100 && !check(); i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
  };

  it("envia as leituras novas da estação filtrada", async () => {
    const socket = await app.injectWS("/api/stations/current/ws?station_id=2");
    const messages: unknown[] = [];
    socket.on("message", (data) => messages.push(JSON.parse(String(data))));
    await waitFor(() => broadcaster.subscribers === 1);
    await new Promise((resolve) => setTimeout(resolve, 30));

    monitoring.liveReadings.push(live(1, 1), live(2, 2));
    await waitFor(() => messages.length > 0);

    expect(messages).toEqual([{ type: "reading", ...live(2, 2) }]);

    socket.terminate();
    await waitFor(() => broadcaster.subscribers === 0);
    expect(broadcaster.subscribers).toBe(0);
  });

  it("recusa estação inexistente e filtro inválido", async () => {
    await expect(
      app.injectWS("/api/stations/current/ws?station_id=99"),
    ).rejects.toThrow();
    await expect(
      app.injectWS("/api/stations/current/ws?station_id=abc"),
    ).rejects.toThrow();
    expect(broadcaster.subscribers).toBe(0);
  });
});
