import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ForecastProviderError,
  ForecastUnavailableError,
} from "@/modules/forecast/errors/forecast.errors.js";
import type { ForecastProvider } from "@/modules/forecast/providers/forecast.provider.js";
import {
  PgReportRepository,
  type ReportForecastErrorContext,
} from "@/modules/reports/repositories/pg-report.repository.js";

describe("PgReportRepository", () => {
  const query = vi.fn();
  const pool = { query } as unknown as Pool;
  let forecastProvider: ForecastProvider;
  let extendedProvider: ForecastProvider;
  let onForecastError: ReturnType<
    typeof vi.fn<(error: unknown, context: ReportForecastErrorContext) => void>
  >;
  let repository: PgReportRepository;

  beforeEach(() => {
    query.mockReset();
    forecastProvider = {
      source: "open-meteo-cache",
      daily: vi.fn().mockResolvedValue([]),
    };
    extendedProvider = {
      source: "open-meteo",
      daily: vi.fn().mockResolvedValue([]),
    };
    onForecastError = vi.fn();
    repository = new PgReportRepository(
      pool,
      forecastProvider,
      extendedProvider,
      onForecastError,
    );
  });

  describe("getStationInfo", () => {
    it("mapeia os dados da estação e propriedade convertendo campos numéricos", async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: "1",
            name: "Estação Norte",
            latitude: "-23.1896",
            longitude: "-45.8841",
            property_id: "10",
            property_name: "Fazenda Modelo",
          },
        ],
      });

      const station = await repository.getStationInfo(1);

      expect(query).toHaveBeenCalledWith(expect.any(String), [1]);
      expect(station).toEqual({
        id: 1,
        name: "Estação Norte",
        latitude: -23.1896,
        longitude: -45.8841,
        property_id: 10,
        property_name: "Fazenda Modelo",
      });
    });

    it("preserva latitude e longitude nulas e retorna null quando estação não existe", async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            name: "Estação Sem GPS",
            latitude: null,
            longitude: null,
            property_id: 10,
            property_name: "Fazenda Modelo",
          },
        ],
      });
      await expect(repository.getStationInfo(2)).resolves.toMatchObject({
        latitude: null,
        longitude: null,
      });

      query.mockResolvedValueOnce({ rows: [] });
      await expect(repository.getStationInfo(999)).resolves.toBeNull();
    });
  });

  describe("getPropertyInfo", () => {
    it("retorna propriedade mapeada ou null quando inexistente", async () => {
      query.mockResolvedValueOnce({ rows: [{ id: "5", name: "Sítio Verde" }] });
      await expect(repository.getPropertyInfo(5)).resolves.toEqual({
        id: 5,
        name: "Sítio Verde",
      });

      query.mockResolvedValueOnce({ rows: [] });
      await expect(repository.getPropertyInfo(999)).resolves.toBeNull();
    });
  });

  describe("getReadings", () => {
    it("consulta leituras com período unix e filtros opcionais nulos", async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: "1001",
            station_id: "1",
            sensor_id: "12",
            sensor_type_id: "3",
            sensor_type: "Temperatura",
            unit_of_measure: "°C",
            value: "24.75",
            unix_time: "1730462400",
            data_consistent: true,
          },
        ],
      });

      const readings = await repository.getReadings({
        from_unix: 1730460000,
        to_unix: 1730470000,
      });

      expect(query).toHaveBeenCalledWith(expect.any(String), [
        1730460000,
        1730470000,
        null,
        null,
      ]);
      expect(readings).toEqual([
        {
          id: 1001,
          station_id: 1,
          sensor_id: 12,
          sensor_type_id: 3,
          sensor_type: "Temperatura",
          unit_of_measure: "°C",
          value: 24.75,
          unix_time: 1730462400,
          data_consistent: true,
        },
      ]);
    });

    it("encaminha station_id e property_id quando informados", async () => {
      query.mockResolvedValueOnce({ rows: [] });

      await repository.getReadings({
        station_id: 4,
        property_id: 9,
        from_unix: 100,
        to_unix: 200,
      });

      expect(query).toHaveBeenCalledWith(expect.any(String), [100, 200, 4, 9]);
    });
  });

  describe("getAlerts", () => {
    it("consulta alertas com timestamps ISO UTC e converte triggered_at Date ou string", async () => {
      const from = new Date("2026-11-01T00:00:00.000Z");
      const to = new Date("2026-11-08T23:59:59.999Z");

      query.mockResolvedValueOnce({
        rows: [
          {
            id: "50",
            station_id: "1",
            station_name: "Estação Norte",
            sensor_id: "8",
            sensor_type: "Temperatura",
            unit_of_measure: "°C",
            rule_name: "Calor Excessivo",
            condition: "> 35",
            threshold_value: "35",
            reading_value: "37.4",
            triggered_at: new Date("2026-11-05T14:30:00.000Z"),
            status: "pending",
          },
          {
            id: "49",
            station_id: "1",
            station_name: "Estação Norte",
            sensor_id: "8",
            sensor_type: "Temperatura",
            unit_of_measure: "°C",
            rule_name: "Alerta #3",
            condition: "< 10",
            threshold_value: 10,
            reading_value: 8.5,
            triggered_at: "2026-11-04 06:15:00",
            status: "acknowledged",
          },
        ],
      });

      const alerts = await repository.getAlerts({
        station_id: 1,
        from_date: from,
        to_date: to,
      });

      expect(query).toHaveBeenCalledWith(expect.any(String), [
        from.toISOString(),
        to.toISOString(),
        1,
        null,
      ]);
      expect(alerts).toEqual([
        {
          id: 50,
          station_id: 1,
          station_name: "Estação Norte",
          sensor_id: 8,
          sensor_type: "Temperatura",
          unit_of_measure: "°C",
          rule_name: "Calor Excessivo",
          condition: "> 35",
          threshold_value: 35,
          reading_value: 37.4,
          triggered_at: "2026-11-05T14:30:00.000Z",
          status: "pending",
        },
        {
          id: 49,
          station_id: 1,
          station_name: "Estação Norte",
          sensor_id: 8,
          sensor_type: "Temperatura",
          unit_of_measure: "°C",
          rule_name: "Alerta #3",
          condition: "< 10",
          threshold_value: 10,
          reading_value: 8.5,
          triggered_at: "2026-11-04T06:15:00.000Z",
          status: "acknowledged",
        },
      ]);
    });
  });

  describe("getForecast", () => {
    it("utiliza provedor em cache para até 7 dias e provedor estendido acima de 7 dias", async () => {
      await repository.getForecast({
        station_id: 1,
        latitude: -23.18,
        longitude: -45.88,
        days: 7,
      });
      expect(forecastProvider.daily).toHaveBeenCalledWith({
        latitude: -23.18,
        longitude: -45.88,
        days: 7,
      });
      expect(extendedProvider.daily).not.toHaveBeenCalled();

      const extendedResult = await repository.getForecast({
        station_id: 1,
        latitude: -23.18,
        longitude: -45.88,
        days: 14,
      });
      expect(extendedProvider.daily).toHaveBeenCalledWith({
        latitude: -23.18,
        longitude: -45.88,
        days: 14,
      });
      expect(extendedResult.source).toBe("open-meteo");
    });

    it("usa provedor principal quando não há provedor estendido e traduz ForecastProviderError em 503", async () => {
      const repoWithoutExtended = new PgReportRepository(
        pool,
        forecastProvider,
        undefined,
        onForecastError,
      );
      const cause = new ForecastProviderError("timeout");
      vi.mocked(forecastProvider.daily).mockRejectedValueOnce(cause);

      const error = await repoWithoutExtended
        .getForecast({
          station_id: 1,
          latitude: -23.18,
          longitude: -45.88,
          days: 10,
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForecastUnavailableError);
      expect((error as ForecastUnavailableError).statusCode).toBe(503);
      expect(onForecastError).toHaveBeenCalledWith(cause, {
        station_id: 1,
        latitude: -23.18,
        longitude: -45.88,
        days: 10,
      });
    });

    it("propaga erros inesperados do provedor sem convertê-los para 503", async () => {
      const unexpected = new TypeError("bug interno");
      vi.mocked(forecastProvider.daily).mockRejectedValueOnce(unexpected);

      await expect(
        repository.getForecast({
          station_id: 1,
          latitude: -23.18,
          longitude: -45.88,
          days: 5,
        }),
      ).rejects.toBe(unexpected);
      expect(onForecastError).not.toHaveBeenCalled();
    });
  });
});
