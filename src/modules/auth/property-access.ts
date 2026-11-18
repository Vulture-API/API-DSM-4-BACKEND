import type { FastifyRequest } from "fastify";
import type { Pool } from "pg";

import { AlertConfigNotFoundError } from "@/modules/alerts/errors/alert-config-not-found.error.js";
import { TriggeredAlertNotFoundError } from "@/modules/alerts/errors/triggered-alert-not-found.error.js";
import { resolveAccessibleProperties } from "@/modules/auth/property-scope.js";
import { OccurrenceNotFoundError } from "@/modules/occurrences/errors/occurrence.errors.js";
import { PropertyNotFoundError } from "@/modules/properties/errors/property.errors.js";
import { ReportPropertyNotFoundError } from "@/modules/reports/errors/report-property-not-found.error.js";
import { ReportStationNotFoundError } from "@/modules/reports/errors/report-station-not-found.error.js";
import { SensorNotFoundError } from "@/modules/sensors/errors/sensor-not-found.error.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";

const resources = {
  property: "SELECT id AS property_id FROM properties WHERE id=$1",
  station: "SELECT property_id FROM stations WHERE id=$1",
  sensor:
    "SELECT st.property_id FROM sensors s JOIN stations st ON st.id=s.station_id WHERE s.id=$1",
  config:
    "SELECT st.property_id FROM alert_configs a JOIN sensors s ON s.id=a.sensor_id JOIN stations st ON st.id=s.station_id WHERE a.id=$1",
  triggered:
    "SELECT st.property_id FROM triggered_alerts t JOIN alert_configs a ON a.id=t.alert_config_id JOIN sensors s ON s.id=a.sensor_id JOIN stations st ON st.id=s.station_id WHERE t.id=$1",
  occurrence:
    "SELECT st.property_id FROM occurrences o JOIN stations st ON st.id=o.station_id WHERE o.id=$1",
} as const;
type Resource = keyof typeof resources;

export class PropertyAccess {
  constructor(private readonly pool: Pool) {}

  async stations(ids: number[]): Promise<Set<number>> {
    const result = await this.pool.query<{ id: number }>(
      "SELECT id FROM stations WHERE property_id=ANY($1::int[])",
      [ids],
    );
    return new Set(result.rows.map((row) => row.id));
  }

  async enforce(request: FastifyRequest): Promise<void> {
    if (!request.actor) return; // modo legado
    const ids = resolveAccessibleProperties(request.actor);
    if (ids === null) return;
    const path = request.routeOptions.url ?? "";
    const params = (request.params ?? {}) as Record<string, unknown>;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const query = (request.query ?? {}) as Record<string, unknown>;
    const report = path.startsWith("/api/reports");
    const error = (kind: Resource, id: number) => {
      if (kind === "property")
        return report
          ? new ReportPropertyNotFoundError(id)
          : new PropertyNotFoundError();
      if (kind === "station")
        return report
          ? new ReportStationNotFoundError(id)
          : new StationNotFoundError();
      if (kind === "sensor") return new SensorNotFoundError();
      if (kind === "config") return new AlertConfigNotFoundError();
      if (kind === "triggered") return new TriggeredAlertNotFoundError();
      return new OccurrenceNotFoundError();
    };
    const check = async (kind: Resource, raw: unknown) => {
      if (raw === undefined || raw === null) return;
      const id = Number(raw);
      const result = ids.length
        ? await this.pool.query<{ property_id: number }>(resources[kind], [id])
        : null;
      if (!result?.rows[0] || !ids.includes(result.rows[0].property_id))
        throw error(kind, id);
    };
    // Fastify fornece o padrão da rota, não a URL arbitrária enviada pelo cliente.
    if (/\/(?:api\/)?properties\/:id/.test(path))
      await check("property", params.id);
    else if (path.startsWith("/api/stations/:id"))
      await check("station", params.id);
    else if (/\/sensors\/:id/.test(path)) await check("sensor", params.id);
    else if (path.startsWith("/api/alerts/config/:id"))
      await check("config", params.id);
    else if (path.startsWith("/api/alerts/triggered/:id"))
      await check("triggered", params.id);
    else if (path.startsWith("/api/occurrences/:id"))
      await check("occurrence", params.id);

    // Referências de entrada: impedir mover recursos de/para outra propriedade.
    if (
      /\/(?:properties|stations|sensors|readings|meteorological-data|alerts|occurrences|reports)(?:\/|$)/.test(
        path,
      )
    ) {
      await check("station", params.stationId);
      await check("station", body.station_id);
      await check("station", query.station_id);
      await check("sensor", body.sensor_id);
      await check("sensor", query.sensor_id);
      await check("property", body.property_id);
      if (report) await check("property", query.property_id);
      if (Array.isArray(body.station_ids))
        for (const id of body.station_ids) await check("station", id);
    }
  }
}
