import type { FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PropertyAccess } from "@/modules/auth/property-access.js";
import type { AuthUser } from "@/modules/auth/types.js";
import { ReportPropertyNotFoundError } from "@/modules/reports/errors/report-property-not-found.error.js";
import { ReportStationNotFoundError } from "@/modules/reports/errors/report-station-not-found.error.js";

const actor: AuthUser = {
  id: 7,
  role_id: 99,
  role_name: "Gerente Agrícola",
  name: "Gerente",
  email: "gerente@example.com",
  active: true,
  created_at: "2026-11-01T00:00:00Z",
  permissions: [],
  property_ids: [2],
};
const request = (path: string, options: Record<string, unknown> = {}) =>
  ({
    actor,
    params: {},
    body: {},
    query: {},
    routeOptions: { url: path },
    ...options,
  }) as unknown as FastifyRequest;

const routes = [
  ["/api/properties/:id", "properties"],
  ["/properties/:id", "properties"],
  ["/api/stations/:id/status", "stations"],
  ["/api/sensors/:id", "sensors"],
  ["/sensors/:id", "sensors"],
  ["/api/alerts/config/:id", "alert_configs"],
  ["/api/alerts/triggered/:id/acknowledge", "triggered_alerts"],
  ["/api/occurrences/:id/resolve", "occurrences"],
] as const;

describe("SCRUM-611: validação de referências sem banco ou servidor HTTP", () => {
  const query = vi.fn();
  const access = new PropertyAccess({ query } as unknown as Pool);

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [{ property_id: 2 }], rowCount: 1 });
  });

  it("preserva modo legado e escopo global sem consultar recursos", async () => {
    await access.enforce(
      request("/api/stations/:id", { actor: undefined, params: { id: 42 } }),
    );
    await access.enforce(
      request("/api/stations/:id", {
        actor: { ...actor, role_name: "Administrador", property_ids: [] },
        params: { id: 42 },
      }),
    );
    expect(query).not.toHaveBeenCalled();
  });

  it.each(routes)(
    "permite recurso vinculado em %s usando a identidade atual",
    async (path, table) => {
      await access.enforce(request(path, { params: { id: "42" } }));
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining(table),
        [42],
      );
    },
  );

  it.each(routes)(
    "retorna o mesmo 404 para recurso inexistente e externo em %s",
    async (path) => {
      query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(
        access.enforce(request(path, { params: { id: 42 } })),
      ).rejects.toMatchObject({ statusCode: 404 });
      query.mockResolvedValueOnce({ rows: [{ property_id: 9 }], rowCount: 1 });
      await expect(
        access.enforce(request(path, { params: { id: 42 } })),
      ).rejects.toMatchObject({ statusCode: 404 });
    },
  );

  it("nega usuário sem vínculos sem sequer consultar o ID solicitado", async () => {
    await expect(
      access.enforce(
        request("/api/stations/:id", {
          actor: { ...actor, property_ids: [] },
          params: { id: 42 },
        }),
      ),
    ).rejects.toMatchObject({ code: "STATION_NOT_FOUND", statusCode: 404 });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    [
      "/api/meteorological-data/:stationId",
      { params: { stationId: 42 } },
      "stations",
    ],
    ["/api/readings", { query: { station_id: 42 } }, "stations"],
    ["/api/sensors", { body: { station_id: 42 } }, "stations"],
    ["/api/alerts/config", { body: { sensor_id: 42 } }, "sensors"],
    ["/api/occurrences", { query: { sensor_id: 42 } }, "sensors"],
    ["/api/stations", { body: { property_id: 42 } }, "properties"],
  ])("valida referência de entrada em %s", async (path, options, table) => {
    await access.enforce(request(path, options));
    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(table),
      [42],
    );
  });

  it("nega mudança de uma estação permitida para uma propriedade externa", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ property_id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ property_id: 9 }] });
    await expect(
      access.enforce(
        request("/api/stations/:id", {
          params: { id: 42 },
          body: { property_id: 9 },
        }),
      ),
    ).rejects.toMatchObject({ code: "PROPERTY_NOT_FOUND", statusCode: 404 });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("stations"),
      [42],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("properties"),
      [9],
    );
  });

  it("valida todas as estações de uma associação, além da propriedade de destino", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ property_id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ property_id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ property_id: 9 }] });
    await expect(
      access.enforce(
        request("/api/properties/:id/stations", {
          params: { id: 2 },
          body: { station_ids: [42, 43] },
        }),
      ),
    ).rejects.toMatchObject({ code: "STATION_NOT_FOUND", statusCode: 404 });
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("stations"),
      [43],
    );
  });

  it("preserva os erros de referência específicos do contrato de relatórios", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(
      access.enforce(
        request("/api/reports/history", { query: { property_id: 42 } }),
      ),
    ).rejects.toBeInstanceOf(ReportPropertyNotFoundError);
    query.mockResolvedValueOnce({ rows: [] });
    await expect(
      access.enforce(
        request("/api/reports/forecast", { body: { station_id: 42 } }),
      ),
    ).rejects.toBeInstanceOf(ReportStationNotFoundError);
  });

  it("ignora referências ausentes e campos homônimos de módulos sem propriedade", async () => {
    await access.enforce(
      request("/api/reports/history", {
        body: { station_id: null },
        query: { property_id: null },
      }),
    );
    await access.enforce(
      request("/api/users/:id", {
        params: { id: 42 },
        body: { property_id: 9, station_ids: [99] },
      }),
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("propaga falha da consulta em vez de mascará-la como recurso inexistente", async () => {
    const unavailable = new Error("banco indisponível");
    query.mockRejectedValueOnce(unavailable);
    await expect(
      access.enforce(request("/api/stations/:id", { params: { id: 42 } })),
    ).rejects.toBe(unavailable);
  });

  it("retorna um conjunto deduplicado de estações e parametriza os vínculos", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 42 }, { id: 42 }, { id: 43 }] });
    expect(await access.stations([2, 7])).toEqual(new Set([42, 43]));
    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("ANY($1::int[])"),
      [[2, 7]],
    );
    query.mockResolvedValueOnce({ rows: [] });
    expect(await access.stations([])).toEqual(new Set());
  });
});
