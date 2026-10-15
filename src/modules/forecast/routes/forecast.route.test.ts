import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "@/app.js";
import { ForecastProviderError } from "@/modules/forecast/errors/forecast.errors.js";
import type { ForecastProvider } from "@/modules/forecast/providers/forecast.provider.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";

describe("previsão meteorológica por estação", () => {
  const now = new Date("2026-10-08T12:00:00.000Z");
  let app: FastifyInstance;
  let provider: ForecastProvider;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const stations = new InMemoryStationRepository();
    await stations.create({
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:01",
      name: "Estação 1",
      latitude: -23.18,
      longitude: -45.88,
    });
    await stations.create({
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:02",
      name: "Sem posição",
      latitude: null,
      longitude: null,
    });
    provider = {
      source: "fake",
      daily: vi.fn(async ({ days }) =>
        Array.from({ length: days }, (_, i) => ({
          date: `2026-10-${String(8 + i).padStart(2, "0")}`,
          temperature_max: 30,
          temperature_min: 18,
          precipitation_mm: 0,
          precipitation_probability: 5,
          wind_speed_max_kmh: 10,
          weather_code: 0,
        })),
      ),
    };
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    app = buildApp({
      stationRepository: stations,
      forecastProvider: provider,
      clock: () => now,
    });
    await app.ready();
  });

  afterEach(async () => {
    errorSpy.mockRestore();
    await app.close();
  });

  it("devolve 7 dias de previsão pela posição da estação", async () => {
    const response = await app.inject("/api/stations/1/forecast");

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      station_id: 1,
      latitude: -23.18,
      longitude: -45.88,
      source: "fake",
      generated_at: "2026-10-08T12:00:00.000Z",
    });
    expect(body.days).toHaveLength(7);
    expect(provider.daily).toHaveBeenCalledWith({
      latitude: -23.18,
      longitude: -45.88,
      days: 7,
    });
  });

  it("aceita de 1 a 7 dias", async () => {
    expect(
      (await app.inject("/api/stations/1/forecast?days=3")).json().days,
    ).toHaveLength(3);
    expect(
      (await app.inject("/api/stations/1/forecast?days=0")).statusCode,
    ).toBe(400);
    expect(
      (await app.inject("/api/stations/1/forecast?days=8")).statusCode,
    ).toBe(400);
  });

  it("404 para estação inexistente e 422 sem coordenadas", async () => {
    const missing = await app.inject("/api/stations/99/forecast");
    expect(missing.statusCode).toBe(404);

    const noPosition = await app.inject("/api/stations/2/forecast");
    expect(noPosition.statusCode).toBe(422);
    expect(noPosition.json().code).toBe("STATION_WITHOUT_COORDINATES");
  });

  it("503 quando o provedor falha, sem expor o erro", async () => {
    vi.mocked(provider.daily).mockRejectedValueOnce(
      new ForecastProviderError("timeout"),
    );

    const response = await app.inject("/api/stations/1/forecast");

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: "FORECAST_UNAVAILABLE",
      message: "Forecast provider is unavailable.",
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("erro que não é do provedor sobe como 500", async () => {
    vi.mocked(provider.daily).mockRejectedValueOnce(new TypeError("bug"));

    const response = await app.inject("/api/stations/1/forecast");

    expect(response.statusCode).toBe(500);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("estação na latitude ou longitude zero tem previsão", async () => {
    const stations = new InMemoryStationRepository();
    await stations.create({
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:03",
      name: "Equador",
      latitude: 0,
      longitude: 0,
    });
    const other = buildApp({
      stationRepository: stations,
      forecastProvider: provider,
      clock: () => now,
    });

    const response = await other.inject("/api/stations/1/forecast?days=1");

    expect(response.statusCode).toBe(200);
    await other.close();
  });

  it("valida id e days", async () => {
    expect((await app.inject("/api/stations/abc/forecast")).statusCode).toBe(
      400,
    );
    expect(
      (await app.inject("/api/stations/1/forecast?days=1.5")).statusCode,
    ).toBe(400);
  });
});
