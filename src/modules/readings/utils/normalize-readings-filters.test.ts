import { describe, expect, it } from "vitest";

import type { ListReadingsFilters } from "@/modules/readings/types/reading.type.js";
import { normalizeReadingsFilters } from "@/modules/readings/utils/normalize-readings-filters.js";

const base = { page: 1, limit: 20 };
const start = Date.parse("2024-10-04T00:00:00Z") / 1000;

describe("normalizeReadingsFilters", () => {
  it("preserva filtros e entrada sem período", () => {
    const input = Object.freeze({ ...base, station_id: 1, sensor_id: 10 });
    expect(normalizeReadingsFilters(input)).toEqual({
      ...input,
      start_unix_time: undefined,
      end_unix_time: undefined,
    });
    expect(input).toEqual({ ...base, station_id: 1, sensor_id: 10 });
  });

  it.each([
    [
      { start_date: "2024-10-04", end_date: "2024-10-04" },
      start,
      start + 86399,
    ],
    [{ start_date: "2024-10-04" }, start, undefined],
    [{ end_date: "2024-10-04" }, undefined, start + 86399],
    [
      { initial_date: "2024-10-04", final_date: "2024-10-04" },
      start,
      start + 86399,
    ],
    [
      { start_date: "2024-10-04T00:00:00", end_date: "2024-10-04T00:00:00" },
      start,
      start,
    ],
    [
      {
        start_date: "2024-10-03T21:00:00-03:00",
        end_date: "2024-10-04T03:00:00+03:00",
      },
      start,
      start,
    ],
    [{ start_unix_time: 0, end_unix_time: 0 }, 0, 0],
    [{ start_unix_time: start, end_date: "2024-10-04" }, start, start + 86399],
    [{ start_date: "2024-10-04", end_unix_time: start }, start, start],
    [
      { start_date: "2024-02-29", end_date: "2024-02-29" },
      1709164800,
      1709251199,
    ],
  ])("normaliza os limites inclusivos: %j", (period, from, to) => {
    expect(normalizeReadingsFilters({ ...base, ...period })).toMatchObject({
      start_unix_time: from,
      end_unix_time: to,
    });
  });

  it("preserva precedência de Unix, datas canônicas e aliases", () => {
    const input = {
      ...base,
      start_unix_time: 0,
      end_unix_time: 1,
      start_date: "2024-10-04",
      end_date: "2024-10-05",
      initial_date: "inválido ignorado",
      final_date: "inválido ignorado",
    };
    expect(normalizeReadingsFilters(input)).toMatchObject({
      start_unix_time: 0,
      end_unix_time: 1,
    });
    expect(
      normalizeReadingsFilters({
        ...base,
        start_date: "2024-10-04",
        initial_date: "2024-10-03",
      }).start_unix_time,
    ).toBe(start);
  });

  it.each([
    { start_date: "" },
    { start_date: "2023-02-29" },
    { end_date: "2024-02-30" },
    { start_date: "2024-13-01" },
    { start_date: "2024-00-01" },
    { end_date: "2024-10-00" },
    { start_date: "2024-10-04T24:00:00Z" },
    { end_date: "2024-10-04T00:60:00Z" },
    { initial_date: "não é uma data" },
    { final_date: "2024-10-04T00:00:60Z" },
    { start_unix_time: 0, start_date: "inválido" },
  ])("recusa datas inválidas: %j", (period) => {
    expect(() => normalizeReadingsFilters({ ...base, ...period })).toThrow(
      expect.objectContaining({ statusCode: 400, code: "INVALID_DATE" }),
    );
  });

  it.each<ListReadingsFilters>([
    { ...base, start_date: "2024-10-05", end_date: "2024-10-04" },
    { ...base, initial_date: "2024-10-05", final_date: "2024-10-04" },
    { ...base, start_unix_time: 2, end_unix_time: 1 },
    { ...base, start_unix_time: start + 1, end_date: "2024-10-04T00:00:00Z" },
    { ...base, start_date: "2024-10-04T00:00:00Z", end_unix_time: start - 1 },
  ])("recusa períodos invertidos após resolver os limites: %j", (input) => {
    expect(() => normalizeReadingsFilters(input)).toThrow(
      expect.objectContaining({ statusCode: 400, code: "INVALID_PERIOD" }),
    );
  });
});
