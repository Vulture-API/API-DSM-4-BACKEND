import { describe, expect, it } from "vitest";

import { reportRequestSchema } from "@/modules/reports/schemas/report.schema.js";

describe("reportRequestSchema", () => {
  it("aceita parâmetros mínimos com type e converte filtros opcionais", () => {
    const parsed = reportRequestSchema.parse({
      type: "  historico  ",
      station_id: "3",
      property_id: 2,
      days: "10",
    });

    expect(parsed).toEqual({
      type: "historico",
      station_id: 3,
      property_id: 2,
      from: undefined,
      to: undefined,
      days: 10,
    });
  });

  it("normaliza type ausente/nulo para string vazia e opcionais nulos/vazios para undefined", () => {
    const parsed = reportRequestSchema.parse({
      type: null,
      station_id: null,
      property_id: "",
      from: "",
      to: null,
      days: null,
    });

    expect(parsed).toEqual({
      type: "",
      station_id: undefined,
      property_id: undefined,
      from: undefined,
      to: undefined,
      days: undefined,
    });
  });

  it("expande datas YYYY-MM-DD para início e fim do dia UTC e preserva datetimes ISO", () => {
    const dateOnly = reportRequestSchema.parse({
      type: "history",
      from: "2026-11-01",
      to: "2026-11-10",
    });
    expect(dateOnly.from).toBe("2026-11-01T00:00:00.000Z");
    expect(dateOnly.to).toBe("2026-11-10T23:59:59.999Z");

    const iso = reportRequestSchema.parse({
      type: "alerts",
      from: "2026-11-01T10:00:00",
      to: "2026-11-02T15:30:00-03:00",
    });
    expect(iso.from).toBe("2026-11-01T10:00:00Z");
    expect(iso.to).toBe("2026-11-02T15:30:00-03:00");
  });

  it.each([
    ["station_id zero", { type: "history", station_id: 0 }],
    ["station_id negativo", { type: "history", station_id: "-2" }],
    ["station_id textual", { type: "history", station_id: "abc" }],
    ["station_id booleano", { type: "history", station_id: true }],
    ["station_id acima de int4", { type: "history", station_id: 99999999999 }],
    ["property_id inválido", { type: "alerts", property_id: 1.5 }],
    ["days abaixo do limite", { type: "forecast", days: 0 }],
    ["days acima de 16", { type: "forecast", days: 17 }],
    [
      "data from inexistente no calendário",
      { type: "history", from: "2026-02-30" },
    ],
    ["data to em formato inválido", { type: "alerts", to: "ontem" }],
    ["type não textual", { type: 123 }],
    ["campo desconhecido (strict)", { type: "history", unknown_param: 1 }],
  ])("recusa entrada inválida: %s", (_label, payload) => {
    const result = reportRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
