import { beforeEach, describe, expect, it } from "vitest";

import { InvalidReportPeriodError } from "@/modules/reports/errors/invalid-report-period.error.js";
import { InvalidReportTypeError } from "@/modules/reports/errors/invalid-report-type.error.js";
import { ReportPropertyNotFoundError } from "@/modules/reports/errors/report-property-not-found.error.js";
import { ReportStationNotFoundError } from "@/modules/reports/errors/report-station-not-found.error.js";
import { StationCoordinatesMissingError } from "@/modules/reports/errors/station-coordinates-missing.error.js";
import { StationRequiredForForecastError } from "@/modules/reports/errors/station-required-for-forecast.error.js";
import { InMemoryReportRepository } from "@/modules/reports/repositories/report.repository.js";
import {
  GenerateReportService,
  getWeatherDescription,
} from "@/modules/reports/services/generate-report.service.js";

const now = new Date("2026-11-01T12:00:00.000Z");

describe("GenerateReportService", () => {
  let repository: InMemoryReportRepository;
  let service: GenerateReportService;

  beforeEach(() => {
    repository = new InMemoryReportRepository();
    service = new GenerateReportService(repository, () => now);

    repository.stations = [
      {
        id: 1,
        name: "Estação Norte",
        latitude: -23.5505,
        longitude: -46.6333,
        property_id: 10,
        property_name: "Fazenda Sol Nascente",
      },
      {
        id: 2,
        name: "Estação Sem Coordenadas",
        latitude: null,
        longitude: null,
        property_id: 10,
        property_name: "Fazenda Sol Nascente",
      },
    ];

    repository.properties = [
      {
        id: 10,
        name: "Fazenda Sol Nascente",
      },
      {
        id: 20,
        name: "Fazenda Bela Vista",
      },
    ];
  });

  describe("Tipo de relatório: histórico (history)", () => {
    it("gera relatório de histórico com agregação estatística e leituras cronológicas", async () => {
      const baseUnix = Math.floor(
        new Date("2026-10-28T00:00:00.000Z").getTime() / 1000,
      );

      repository.readings = [
        {
          id: 2,
          sensor_id: 101,
          sensor_type_id: 1,
          sensor_type: "Temperatura",
          unit_of_measure: "°C",
          value: 30,
          unix_time: baseUnix + 7200,
          data_consistent: true,
        },
        {
          id: 1,
          sensor_id: 101,
          sensor_type_id: 1,
          sensor_type: "Temperatura",
          unit_of_measure: "°C",
          value: 20,
          unix_time: baseUnix + 3600,
          data_consistent: true,
        },
        {
          id: 3,
          sensor_id: 102,
          sensor_type_id: 2,
          sensor_type: "Pluviômetro",
          unit_of_measure: "mm",
          value: 15,
          unix_time: baseUnix + 3600,
          data_consistent: true,
        },
      ];

      const report = await service.execute({
        type: "history",
        station_id: 1,
        from: new Date("2026-10-27T00:00:00.000Z"),
        to: new Date("2026-10-29T00:00:00.000Z"),
      });

      expect(report.report_type).toBe("history");
      expect(report.generated_at).toBe(now.toISOString());
      expect(report.station).toEqual({ id: 1, name: "Estação Norte" });
      expect(report.property).toEqual({
        id: 10,
        name: "Fazenda Sol Nascente",
      });
      if (report.report_type !== "history") throw new Error("Tipo incorreto");

      expect(report.total_readings).toBe(3);
      expect(report.summary).toHaveLength(2);

      const tempSummary = report.summary.find((s) => s.sensor_type_id === 1);
      expect(tempSummary).toBeDefined();
      expect(tempSummary?.count).toBe(2);
      expect(tempSummary?.avg).toBe(25);
      expect(tempSummary?.min).toBe(20);
      expect(tempSummary?.max).toBe(30);
      expect(tempSummary?.stddev).toBe(5);
      expect(tempSummary?.accumulated).toBeNull();

      const rainSummary = report.summary.find((s) => s.sensor_type_id === 2);
      expect(rainSummary?.accumulated).toBe(15);

      expect(report.readings[0]?.id).toBe(1);
      expect(report.readings[1]?.id).toBe(3);
      expect(report.readings[2]?.id).toBe(2);
    });

    it("retorna histórico vazio quando não há leituras no período", async () => {
      repository.readings = [];

      const report = await service.execute({
        type: "historico",
        station_id: 1,
      });

      expect(report.report_type).toBe("history");
      if (report.report_type !== "history") throw new Error("Tipo incorreto");
      expect(report.total_readings).toBe(0);
      expect(report.summary).toEqual([]);
      expect(report.readings).toEqual([]);
    });

    it("aceita os aliases de histórico", async () => {
      for (const alias of [
        "history",
        "historico",
        "histórico",
        "leituras",
        "dados",
        "HISTORICO",
      ]) {
        const report = await service.execute({ type: alias, station_id: 1 });
        expect(report.report_type).toBe("history");
      }
    });
  });

  describe("Tipo de relatório: previsões (forecast)", () => {
    beforeEach(() => {
      repository.forecastSource = "Open-Meteo";
      repository.forecastDays = [
        {
          date: "2026-11-01",
          temperature_min: 18.0,
          temperature_max: 28.5,
          precipitation_mm: 5.2,
          precipitation_probability: 70,
          wind_speed_max_kmh: 15.4,
          weather_code: 61,
        },
        {
          date: "2026-11-02",
          temperature_min: 17.5,
          temperature_max: 29.0,
          precipitation_mm: 0,
          precipitation_probability: 10,
          wind_speed_max_kmh: 12.0,
          weather_code: 0,
        },
      ];
    });

    it("gera relatório de previsão meteorológica com dados diários e descrições", async () => {
      const report = await service.execute({
        type: "forecast",
        station_id: 1,
        days: 2,
      });

      expect(report.report_type).toBe("forecast");
      if (report.report_type !== "forecast") throw new Error("Tipo incorreto");

      expect(report.source).toBe("Open-Meteo");
      expect(report.station).toEqual({
        id: 1,
        name: "Estação Norte",
        latitude: -23.5505,
        longitude: -46.6333,
      });
      expect(report.property).toEqual({
        id: 10,
        name: "Fazenda Sol Nascente",
      });
      expect(report.total_days).toBe(2);
      expect(report.days).toHaveLength(2);
      expect(report.days[0]?.date).toBe("2026-11-01");
      expect(report.days[0]?.temperature_max).toBe(28.5);
      expect(report.days[0]?.weather_code).toBe(61);
      expect(report.days[0]?.weather_description).toBe("Chuva");
      expect(report.days[1]?.weather_code).toBe(0);
      expect(report.days[1]?.weather_description).toBe("Céu limpo");
    });

    it("calcula quantidade de dias a partir de from e to", async () => {
      const report = await service.execute({
        type: "previsao",
        station_id: 1,
        from: new Date("2026-11-01T00:00:00.000Z"),
        to: new Date("2026-11-03T00:00:00.000Z"),
      });

      expect(report.report_type).toBe("forecast");
      if (report.report_type !== "forecast") throw new Error("Tipo incorreto");
      expect(report.total_days).toBe(2);
    });

    it("exige informar estação para relatório de previsões", async () => {
      await expect(
        service.execute({ type: "forecast" }),
      ).rejects.toBeInstanceOf(StationRequiredForForecastError);
    });

    it("recusa estação sem latitude/longitude com StationCoordinatesMissingError", async () => {
      await expect(
        service.execute({ type: "forecast", station_id: 2 }),
      ).rejects.toBeInstanceOf(StationCoordinatesMissingError);
    });

    it("aceita os aliases de previsão", async () => {
      for (const alias of [
        "forecast",
        "previsao",
        "previsão",
        "previsoes",
        "previsões",
        "tempo",
        "PREVISAO",
      ]) {
        const report = await service.execute({ type: alias, station_id: 1 });
        expect(report.report_type).toBe("forecast");
      }
    });
  });

  describe("Tipo de relatório: alertas (alerts)", () => {
    it("gera relatório de alertas ordenado por data decrescente", async () => {
      repository.alerts = [
        {
          id: 1,
          station_id: 1,
          station_name: "Estação Norte",
          sensor_id: 101,
          sensor_type: "Temperatura",
          unit_of_measure: "°C",
          rule_name: "Temperatura Alta",
          condition: "> 35",
          threshold_value: 35,
          reading_value: 38.2,
          triggered_at: "2026-10-28T14:00:00.000Z",
          status: "acknowledged",
        },
        {
          id: 2,
          station_id: 1,
          station_name: "Estação Norte",
          sensor_id: 101,
          sensor_type: "Temperatura",
          unit_of_measure: "°C",
          rule_name: "Temperatura Extrema",
          condition: "> 40",
          threshold_value: 40,
          reading_value: 41.5,
          triggered_at: "2026-10-28T16:00:00.000Z",
          status: "pending",
        },
      ];

      const report = await service.execute({
        type: "alerts",
        station_id: 1,
        from: new Date("2026-10-28T00:00:00.000Z"),
        to: new Date("2026-10-29T00:00:00.000Z"),
      });

      expect(report.report_type).toBe("alerts");
      if (report.report_type !== "alerts") throw new Error("Tipo incorreto");

      expect(report.total_alerts).toBe(2);
      expect(report.alerts[0]?.id).toBe(2);
      expect(report.alerts[1]?.id).toBe(1);
    });

    it("retorna lista vazia de alertas quando não há ocorrências no período", async () => {
      repository.alerts = [];

      const report = await service.execute({
        type: "alertas",
        station_id: 1,
      });

      expect(report.report_type).toBe("alerts");
      if (report.report_type !== "alerts") throw new Error("Tipo incorreto");
      expect(report.total_alerts).toBe(0);
      expect(report.alerts).toEqual([]);
    });

    it("aceita os aliases de relatório de alertas", async () => {
      for (const alias of [
        "alerts",
        "alertas",
        "ocorrencias",
        "ocorrências",
        "ALERTAS",
      ]) {
        const report = await service.execute({ type: alias, station_id: 1 });
        expect(report.report_type).toBe("alerts");
      }
    });
  });

  describe("Validações de tipos, datas e escopo", () => {
    it("recusa tipo de relatório inválido com InvalidReportTypeError e mensagem detalhada", async () => {
      const promise = service.execute({ type: "desconhecido" });
      await expect(promise).rejects.toBeInstanceOf(InvalidReportTypeError);
      await expect(promise).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_REPORT_TYPE",
        message: expect.stringContaining(
          "O tipo 'desconhecido' não é suportado",
        ),
      });
    });

    it("aplica período padrão de 7 dias retroativos quando from não é informado", async () => {
      const report = await service.execute({
        type: "history",
        station_id: 1,
      });

      expect(report.period.to).toBe("2026-11-01T12:00:00.000Z");
      expect(report.period.from).toBe("2026-10-25T12:00:00.000Z");
    });

    it("calcula 7 dias antes quando apenas to é fornecido", async () => {
      const report = await service.execute({
        type: "history",
        station_id: 1,
        to: new Date("2026-10-20T00:00:00.000Z"),
      });

      expect(report.period.to).toBe("2026-10-20T00:00:00.000Z");
      expect(report.period.from).toBe("2026-10-13T00:00:00.000Z");
    });

    it("recusa período com data inicial igual ou posterior à data final com mensagem detalhada", async () => {
      await expect(
        service.execute({
          type: "history",
          from: new Date("2026-10-28T00:00:00.000Z"),
          to: new Date("2026-10-28T00:00:00.000Z"),
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_REPORT_PERIOD",
        message: expect.stringContaining("deve ser estritamente anterior"),
      });

      await expect(
        service.execute({
          type: "history",
          from: new Date("2026-10-29T00:00:00.000Z"),
          to: new Date("2026-10-28T00:00:00.000Z"),
        }),
      ).rejects.toBeInstanceOf(InvalidReportPeriodError);
    });

    it("recusa datas em formatos inválidos informando o campo com erro", async () => {
      await expect(
        service.execute({
          type: "history",
          from: "data-invalida",
          to: new Date("2026-10-28T00:00:00.000Z"),
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_REPORT_PERIOD",
        message: expect.stringContaining(
          "O campo 'from' com valor 'data-invalida'",
        ),
      });

      await expect(
        service.execute({
          type: "history",
          to: "data-invalida",
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_REPORT_PERIOD",
        message: expect.stringContaining(
          "O campo 'to' com valor 'data-invalida'",
        ),
      });
    });

    it("recusa períodos maiores que 366 dias informando os dias solicitados", async () => {
      const to = new Date("2026-10-01T00:00:00.000Z");
      const from = new Date(to.getTime() - 367 * 86_400_000);

      await expect(
        service.execute({
          type: "history",
          from,
          to,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_REPORT_PERIOD",
        message: expect.stringContaining(
          "ultrapassa o limite máximo permitido de 366 dias",
        ),
      });
    });

    it("recusa estação inexistente com ReportStationNotFoundError", async () => {
      const promise = service.execute({
        type: "history",
        station_id: 999,
      });
      await expect(promise).rejects.toBeInstanceOf(ReportStationNotFoundError);
      await expect(promise).rejects.toMatchObject({
        statusCode: 404,
        code: "STATION_NOT_FOUND",
        message: expect.stringContaining("ID 999 não foi encontrada"),
      });
    });

    it("recusa propriedade inexistente com ReportPropertyNotFoundError", async () => {
      const promise = service.execute({
        type: "history",
        property_id: 999,
      });
      await expect(promise).rejects.toBeInstanceOf(ReportPropertyNotFoundError);
      await expect(promise).rejects.toMatchObject({
        statusCode: 404,
        code: "PROPERTY_NOT_FOUND",
        message: expect.stringContaining("ID 999 não foi encontrada"),
      });
    });

    it("preenche escopo de propriedade quando property_id é informado diretamente", async () => {
      const report = await service.execute({
        type: "history",
        property_id: 20,
      });

      expect(report.station).toBeNull();
      expect(report.property).toEqual({
        id: 20,
        name: "Fazenda Bela Vista",
      });
    });
  });

  describe("getWeatherDescription helper", () => {
    it("mapeia códigos WMO conhecidos e trata nulos e códigos desconhecidos", () => {
      expect(getWeatherDescription(null)).toBeNull();
      expect(getWeatherDescription(undefined as unknown as number)).toBeNull();
      expect(getWeatherDescription(0)).toBe("Céu limpo");
      expect(getWeatherDescription(1)).toBe("Predominantemente limpo");
      expect(getWeatherDescription(2)).toBe("Parcialmente nublado");
      expect(getWeatherDescription(3)).toBe("Encoberto");
      expect(getWeatherDescription(45)).toBe("Nevoeiro");
      expect(getWeatherDescription(51)).toBe("Garoa");
      expect(getWeatherDescription(61)).toBe("Chuva");
      expect(getWeatherDescription(71)).toBe("Neve");
      expect(getWeatherDescription(80)).toBe("Pancadas de chuva");
      expect(getWeatherDescription(95)).toBe("Tempestade");
      expect(getWeatherDescription(999)).toBe("Tempo instável");
    });
  });
});
