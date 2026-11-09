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

const FIXED_NOW = new Date("2026-11-01T12:00:00.000Z");

describe("GenerateReportService", () => {
  let repository: InMemoryReportRepository;
  let service: GenerateReportService;

  beforeEach(() => {
    repository = new InMemoryReportRepository();
    service = new GenerateReportService(repository, () => FIXED_NOW);

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

  describe("1. Relatório Histórico (history)", () => {
    describe("Cálculos estatísticos e agregação de sensores", () => {
      it("calcula média, mínimo, máximo, desvio padrão e chuva acumulada corretamente", async () => {
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

        expect(report.report_type, "Tipo do relatório deve ser history").toBe(
          "history",
        );
        expect(
          report.generated_at,
          "Data de geração deve seguir relógio injetado",
        ).toBe(FIXED_NOW.toISOString());
        expect(
          report.station,
          "Metadados da estação devem corresponder ao id 1",
        ).toEqual({
          id: 1,
          name: "Estação Norte",
        });
        expect(
          report.property,
          "Metadados da propriedade devem corresponder à fazenda",
        ).toEqual({
          id: 10,
          name: "Fazenda Sol Nascente",
        });

        if (report.report_type !== "history") {
          throw new Error("Falha de tipo: payload não é relatório histórico");
        }

        expect(report.total_readings, "Total de leituras deve ser 3").toBe(3);
        expect(
          report.summary,
          "Deve conter resumo para 2 tipos de sensores",
        ).toHaveLength(2);

        const tempSummary = report.summary.find((s) => s.sensor_type_id === 1);
        expect(tempSummary, "Resumo de temperatura deve existir").toBeDefined();
        expect(
          tempSummary?.count,
          "Quantidade de leituras de temperatura deve ser 2",
        ).toBe(2);
        expect(
          tempSummary?.avg,
          "Média de temperatura de 20 e 30 deve ser 25",
        ).toBe(25);
        expect(
          tempSummary?.min,
          "Valor mínimo de temperatura deve ser 20",
        ).toBe(20);
        expect(
          tempSummary?.max,
          "Valor máximo de temperatura deve ser 30",
        ).toBe(30);
        expect(
          tempSummary?.stddev,
          "Desvio padrão populacional de [20, 30] deve ser 5",
        ).toBe(5);
        expect(
          tempSummary?.accumulated,
          "Temperatura não deve ter valor acumulado",
        ).toBeNull();

        const rainSummary = report.summary.find((s) => s.sensor_type_id === 2);
        expect(rainSummary, "Resumo de chuva deve existir").toBeDefined();
        expect(
          rainSummary?.accumulated,
          "Pluviômetro deve calcular soma acumulada (15mm)",
        ).toBe(15);

        expect(
          report.readings[0]?.id,
          "Primeira leitura ordenada cronologicamente deve ter id 1",
        ).toBe(1);
        expect(
          report.readings[1]?.id,
          "Segunda leitura ordenada cronologicamente deve ter id 3",
        ).toBe(3);
        expect(
          report.readings[2]?.id,
          "Terceira leitura ordenada cronologicamente deve ter id 2",
        ).toBe(2);
      });
    });

    describe("Tratamento de dados ausentes e aliases", () => {
      it("retorna estrutura vazia quando não há leituras no período selecionado", async () => {
        repository.readings = [];

        const report = await service.execute({
          type: "historico",
          station_id: 1,
        });

        expect(
          report.report_type,
          "Tipo retornado deve ser normalizado para history",
        ).toBe("history");
        if (report.report_type !== "history") {
          throw new Error("Falha de tipo: payload não é relatório histórico");
        }
        expect(report.total_readings, "Total de leituras deve ser 0").toBe(0);
        expect(report.summary, "Resumo deve ser array vazio").toEqual([]);
        expect(
          report.readings,
          "Lista de leituras deve ser array vazio",
        ).toEqual([]);
      });

      it("reconhece todos os aliases aceitos para histórico", async () => {
        const aliases = [
          "history",
          "historico",
          "histórico",
          "leituras",
          "dados",
          "HISTORICO",
        ];

        for (const alias of aliases) {
          const report = await service.execute({ type: alias, station_id: 1 });
          expect(
            report.report_type,
            `Alias '${alias}' deve resolver para history`,
          ).toBe("history");
        }
      });
    });
  });

  describe("2. Relatório de Previsões (forecast)", () => {
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

    describe("Geração e mapeamento diário", () => {
      it("retorna previsão diária estruturada com descrição em português via código WMO", async () => {
        const report = await service.execute({
          type: "forecast",
          station_id: 1,
          days: 2,
        });

        expect(report.report_type, "Tipo do relatório deve ser forecast").toBe(
          "forecast",
        );
        if (report.report_type !== "forecast") {
          throw new Error("Falha de tipo: payload não é relatório de previsão");
        }

        expect(
          report.source,
          "Provedor meteorológico deve ser Open-Meteo",
        ).toBe("Open-Meteo");
        expect(
          report.station,
          "Metadados de estação devem incluir latitude e longitude",
        ).toEqual({
          id: 1,
          name: "Estação Norte",
          latitude: -23.5505,
          longitude: -46.6333,
        });
        expect(report.total_days, "Total de dias deve ser 2").toBe(2);
        expect(
          report.days,
          "Lista de dias deve conter 2 registros",
        ).toHaveLength(2);

        const dia1 = report.days[0];
        expect(dia1?.date, "Data do primeiro dia deve ser 2026-11-01").toBe(
          "2026-11-01",
        );
        expect(dia1?.temperature_max, "Temperatura máxima deve ser 28.5").toBe(
          28.5,
        );
        expect(dia1?.weather_code, "Código WMO deve ser 61").toBe(61);
        expect(
          dia1?.weather_description,
          "Código 61 deve traduzir para Chuva",
        ).toBe("Chuva");

        const dia2 = report.days[1];
        expect(dia2?.weather_code, "Código WMO deve ser 0").toBe(0);
        expect(
          dia2?.weather_description,
          "Código 0 deve traduzir para Céu limpo",
        ).toBe("Céu limpo");
      });

      it("calcula automaticamente a quantidade de dias quando informado período from e to", async () => {
        const report = await service.execute({
          type: "previsao",
          station_id: 1,
          from: new Date("2026-11-01T00:00:00.000Z"),
          to: new Date("2026-11-03T00:00:00.000Z"),
        });

        expect(report.report_type, "Tipo deve normalizar para forecast").toBe(
          "forecast",
        );
        if (report.report_type !== "forecast") {
          throw new Error("Falha de tipo: payload não é relatório de previsão");
        }
        expect(
          report.total_days,
          "Intervalo de 2 dias deve resultar em total_days = 2",
        ).toBe(2);
      });
    });

    describe("Validações obrigatórias para previsão", () => {
      it("rejeita solicitação de previsão sem station_id com StationRequiredForForecastError", async () => {
        await expect(
          service.execute({ type: "forecast" }),
          "Previsão sem station_id deve lançar StationRequiredForForecastError",
        ).rejects.toBeInstanceOf(StationRequiredForForecastError);
      });

      it("rejeita estação sem coordenadas configuradas com StationCoordinatesMissingError", async () => {
        await expect(
          service.execute({ type: "forecast", station_id: 2 }),
          "Estação sem lat/lon deve lançar StationCoordinatesMissingError",
        ).rejects.toBeInstanceOf(StationCoordinatesMissingError);
      });

      it("reconhece todos os aliases aceitos para previsão", async () => {
        const aliases = [
          "forecast",
          "previsao",
          "previsão",
          "previsoes",
          "previsões",
          "tempo",
          "PREVISAO",
        ];

        for (const alias of aliases) {
          const report = await service.execute({ type: alias, station_id: 1 });
          expect(
            report.report_type,
            `Alias '${alias}' deve resolver para forecast`,
          ).toBe("forecast");
        }
      });
    });
  });

  describe("3. Relatório de Alertas (alerts)", () => {
    describe("Listagem e ordenação cronológica", () => {
      it("ordena os alertas disparados de forma decrescente pela data do disparo", async () => {
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

        expect(report.report_type, "Tipo do relatório deve ser alerts").toBe(
          "alerts",
        );
        if (report.report_type !== "alerts") {
          throw new Error("Falha de tipo: payload não é relatório de alertas");
        }

        expect(report.total_alerts, "Total de alertas deve ser 2").toBe(2);
        expect(
          report.alerts[0]?.id,
          "Primeiro alerta deve ser o mais recente (id 2 às 16h)",
        ).toBe(2);
        expect(
          report.alerts[1]?.id,
          "Segundo alerta deve ser o mais antigo (id 1 às 14h)",
        ).toBe(1);
      });
    });

    describe("Tratamento de lista vazia e aliases", () => {
      it("retorna lista vazia com total zero quando não há ocorrências no período", async () => {
        repository.alerts = [];

        const report = await service.execute({
          type: "alertas",
          station_id: 1,
        });

        expect(report.report_type, "Tipo deve normalizar para alerts").toBe(
          "alerts",
        );
        if (report.report_type !== "alerts") {
          throw new Error("Falha de tipo: payload não é relatório de alertas");
        }
        expect(report.total_alerts, "Total de alertas deve ser 0").toBe(0);
        expect(report.alerts, "Lista de alertas deve ser array vazio").toEqual(
          [],
        );
      });

      it("reconhece todos os aliases aceitos para alertas", async () => {
        const aliases = [
          "alerts",
          "alertas",
          "ocorrencias",
          "ocorrências",
          "ALERTAS",
        ];

        for (const alias of aliases) {
          const report = await service.execute({ type: alias, station_id: 1 });
          expect(
            report.report_type,
            `Alias '${alias}' deve resolver para alerts`,
          ).toBe("alerts");
        }
      });
    });
  });

  describe("4. Validações de Parâmetros de Entrada e Tratamento de Erros", () => {
    describe("Validação de tipo de relatório (type)", () => {
      it("recusa tipo inválido com InvalidReportTypeError, código 400 e mensagem explicativa", async () => {
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
    });

    describe("Validação de intervalo de datas (from e to)", () => {
      it("aplica período padrão de 7 dias retroativos a partir de agora quando from não é informado", async () => {
        const report = await service.execute({
          type: "history",
          station_id: 1,
        });

        expect(report.period.to, "Data final deve ser FIXED_NOW").toBe(
          "2026-11-01T12:00:00.000Z",
        );
        expect(
          report.period.from,
          "Data inicial deve ser 7 dias antes de FIXED_NOW",
        ).toBe("2026-10-25T12:00:00.000Z");
      });

      it("calcula 7 dias antes quando apenas a data final (to) é fornecida", async () => {
        const report = await service.execute({
          type: "history",
          station_id: 1,
          to: new Date("2026-10-20T00:00:00.000Z"),
        });

        expect(report.period.to, "Data final deve ser a data informada").toBe(
          "2026-10-20T00:00:00.000Z",
        );
        expect(
          report.period.from,
          "Data inicial deve ser 7 dias antes do to informado",
        ).toBe("2026-10-13T00:00:00.000Z");
      });

      it("rejeita período quando from é posterior ou igual a to com mensagem detalhada", async () => {
        await expect(
          service.execute({
            type: "history",
            from: new Date("2026-10-28T00:00:00.000Z"),
            to: new Date("2026-10-28T00:00:00.000Z"),
          }),
          "from igual a to deve ser recusado",
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
          "from posterior a to deve lançar InvalidReportPeriodError",
        ).rejects.toBeInstanceOf(InvalidReportPeriodError);
      });

      it("rejeita datas em strings não conversíveis apontando o campo exato com erro", async () => {
        await expect(
          service.execute({
            type: "history",
            from: "data-invalida",
            to: new Date("2026-10-28T00:00:00.000Z"),
          }),
          "from inválido deve ser reportado na mensagem",
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
          "to inválido deve ser reportado na mensagem",
        ).rejects.toMatchObject({
          statusCode: 400,
          code: "INVALID_REPORT_PERIOD",
          message: expect.stringContaining(
            "O campo 'to' com valor 'data-invalida'",
          ),
        });
      });

      it("rejeita períodos maiores que 366 dias informando a duração na mensagem", async () => {
        const to = new Date("2026-10-01T00:00:00.000Z");
        const from = new Date(to.getTime() - 367 * 86_400_000);

        await expect(
          service.execute({
            type: "history",
            from,
            to,
          }),
          "Intervalo > 366 dias deve ser bloqueado com erro 400",
        ).rejects.toMatchObject({
          statusCode: 400,
          code: "INVALID_REPORT_PERIOD",
          message: expect.stringContaining(
            "ultrapassa o limite máximo permitido de 366 dias",
          ),
        });
      });
    });

    describe("Validação de escopo e existência de entidades (station e property)", () => {
      it("rejeita estação inexistente com ReportStationNotFoundError e status 404", async () => {
        const promise = service.execute({
          type: "history",
          station_id: 999,
        });
        await expect(promise).rejects.toBeInstanceOf(
          ReportStationNotFoundError,
        );
        await expect(promise).rejects.toMatchObject({
          statusCode: 404,
          code: "STATION_NOT_FOUND",
          message: expect.stringContaining("ID 999 não foi encontrada"),
        });
      });

      it("rejeita propriedade inexistente com ReportPropertyNotFoundError e status 404", async () => {
        const promise = service.execute({
          type: "history",
          property_id: 999,
        });
        await expect(promise).rejects.toBeInstanceOf(
          ReportPropertyNotFoundError,
        );
        await expect(promise).rejects.toMatchObject({
          statusCode: 404,
          code: "PROPERTY_NOT_FOUND",
          message: expect.stringContaining("ID 999 não foi encontrada"),
        });
      });

      it("preenche corretamente escopo quando property_id é informado diretamente sem estação", async () => {
        const report = await service.execute({
          type: "history",
          property_id: 20,
        });

        expect(report.station, "Escopo de estação deve ser nulo").toBeNull();
        expect(
          report.property,
          "Escopo de propriedade deve conter os dados da fazenda",
        ).toEqual({
          id: 20,
          name: "Fazenda Bela Vista",
        });
      });
    });
  });

  describe("5. Helper de Descrições Meteorológicas (getWeatherDescription)", () => {
    it("converte códigos WMO para descrições em português e trata valores desconhecidos ou nulos", () => {
      expect(getWeatherDescription(null), "null deve retornar null").toBeNull();
      expect(
        getWeatherDescription(undefined as unknown as number),
        "undefined deve retornar null",
      ).toBeNull();
      expect(getWeatherDescription(0), "0 deve ser Céu limpo").toBe(
        "Céu limpo",
      );
      expect(
        getWeatherDescription(1),
        "1 deve ser Predominantemente limpo",
      ).toBe("Predominantemente limpo");
      expect(getWeatherDescription(2), "2 deve ser Parcialmente nublado").toBe(
        "Parcialmente nublado",
      );
      expect(getWeatherDescription(3), "3 deve ser Encoberto").toBe(
        "Encoberto",
      );
      expect(getWeatherDescription(45), "45 deve ser Nevoeiro").toBe(
        "Nevoeiro",
      );
      expect(getWeatherDescription(51), "51 deve ser Garoa").toBe("Garoa");
      expect(getWeatherDescription(61), "61 deve ser Chuva").toBe("Chuva");
      expect(getWeatherDescription(71), "71 deve ser Neve").toBe("Neve");
      expect(getWeatherDescription(80), "80 deve ser Pancadas de chuva").toBe(
        "Pancadas de chuva",
      );
      expect(getWeatherDescription(95), "95 deve ser Tempestade").toBe(
        "Tempestade",
      );
      expect(
        getWeatherDescription(999),
        "Código desconhecido deve retornar Tempo instável",
      ).toBe("Tempo instável");
    });
  });
});
