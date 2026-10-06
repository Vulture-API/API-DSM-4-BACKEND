import type { Pool } from "pg";

import { database } from "@/config/database.js";
import { SensorConflictError } from "@/modules/sensors/errors/sensor-conflict.error.js";
import type { Sensor } from "@/modules/sensors/types/sensor.type.js";
import type { PaginatedResult } from "@/shared/schemas/pagination.schema.js";

export interface SensorFilter {
  page?: number | undefined;
  limit?: number | undefined;
  station_id?: number | undefined;
}

export interface SensorUpdateData {
  station_id?: number | undefined;
  sensor_type_id?: number | undefined;
  local_identifier?: string | undefined;
  operational_status?: boolean | undefined;
}

export interface SensorRepository {
  create(data: Omit<Sensor, "id" | "created_at">): Promise<Sensor>;
  findPaginated(filter?: SensorFilter): Promise<PaginatedResult<Sensor>>;
  findById(id: number): Promise<Sensor | null>;
  findByStationAndIdentifier(
    stationId: number,
    localIdentifier: string,
  ): Promise<Sensor | null>;
  countBySensorTypeId(sensorTypeId: number): Promise<number>;
  update(id: number, data: SensorUpdateData): Promise<Sensor | null>;
  delete(id: number): Promise<boolean>;
  stationExists(stationId: number): Promise<boolean>;
  sensorTypeExists(sensorTypeId: number): Promise<boolean>;
}

/** Repositório em memória, usado nos testes. */
export class InMemorySensorRepository implements SensorRepository {
  private readonly sensors: Sensor[] = [];
  private nextId = 1;

  /**
   * Sem listas informadas, qualquer estação/tipo é aceito — os testes de
   * serviço não precisam montar o catálogo inteiro.
   */
  constructor(
    private readonly knownStationIds?: ReadonlySet<number>,
    private readonly knownSensorTypeIds?: ReadonlySet<number>,
  ) {}

  async stationExists(stationId: number): Promise<boolean> {
    return this.knownStationIds?.has(stationId) ?? true;
  }

  async sensorTypeExists(sensorTypeId: number): Promise<boolean> {
    return this.knownSensorTypeIds?.has(sensorTypeId) ?? true;
  }

  async create(data: Omit<Sensor, "id" | "created_at">): Promise<Sensor> {
    const sensor: Sensor = {
      id: this.nextId++,
      station_id: data.station_id,
      sensor_type_id: data.sensor_type_id,
      local_identifier: data.local_identifier,
      operational_status: data.operational_status,
      created_at: new Date().toISOString(),
    };

    this.sensors.push(sensor);
    return sensor;
  }

  async findPaginated(
    filter?: SensorFilter | undefined,
  ): Promise<PaginatedResult<Sensor>> {
    const page = filter?.page ?? 1;
    const limit = filter?.limit ?? 20;

    let filtered = [...this.sensors];
    if (filter?.station_id !== undefined) {
      filtered = filtered.filter((s) => s.station_id === filter.station_id);
    }

    const totalRecords = filtered.length;
    const totalPages = Math.ceil(totalRecords / limit) || 1;
    const startIndex = (page - 1) * limit;
    const data = filtered.slice(startIndex, startIndex + limit);

    return {
      data,
      meta: {
        total_records: totalRecords,
        total_pages: totalPages,
        current_page: page,
      },
    };
  }

  async findById(id: number): Promise<Sensor | null> {
    const found = this.sensors.find((s) => s.id === id);
    return found ? { ...found } : null;
  }

  async findByStationAndIdentifier(
    stationId: number,
    localIdentifier: string,
  ): Promise<Sensor | null> {
    const found = this.sensors.find(
      (s) =>
        s.station_id === stationId &&
        s.local_identifier.toLowerCase() === localIdentifier.toLowerCase(),
    );
    return found ? { ...found } : null;
  }

  async countBySensorTypeId(sensorTypeId: number): Promise<number> {
    return this.sensors.filter((s) => s.sensor_type_id === sensorTypeId).length;
  }

  async update(id: number, data: SensorUpdateData): Promise<Sensor | null> {
    const index = this.sensors.findIndex((s) => s.id === id);
    if (index === -1) {
      return null;
    }

    const current = this.sensors[index]!;
    const updated: Sensor = {
      id: current.id,
      station_id: data.station_id ?? current.station_id,
      sensor_type_id: data.sensor_type_id ?? current.sensor_type_id,
      local_identifier: data.local_identifier ?? current.local_identifier,
      operational_status:
        data.operational_status !== undefined
          ? data.operational_status
          : current.operational_status,
      created_at: current.created_at,
    };

    this.sensors[index] = updated;
    return { ...updated };
  }

  async delete(id: number): Promise<boolean> {
    const index = this.sensors.findIndex((s) => s.id === id);
    if (index === -1) {
      return false;
    }

    this.sensors.splice(index, 1);
    return true;
  }
}

type SensorRow = Omit<Sensor, "created_at"> & { created_at: Date | string };

const SENSOR_COLUMNS =
  "id, station_id, sensor_type_id, local_identifier, operational_status, created_at";

function mapSensor(row: SensorRow): Sensor {
  return {
    ...row,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
  };
}

function hasPgCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === code
  );
}

const isUniqueViolation = (error: unknown) => hasPgCode(error, "23505");
const isForeignKeyViolation = (error: unknown) => hasPgCode(error, "23503");

/** Repositório real: grava na tabela sensors do PostgreSQL. */
export class PgSensorRepository implements SensorRepository {
  constructor(private readonly pool: Pool = database) {}

  async create(data: Omit<Sensor, "id" | "created_at">): Promise<Sensor> {
    try {
      const result = await this.pool.query<SensorRow>(
        `INSERT INTO sensors (station_id, sensor_type_id, local_identifier, operational_status)
         VALUES ($1, $2, $3, $4)
         RETURNING ${SENSOR_COLUMNS}`,
        [
          data.station_id,
          data.sensor_type_id,
          data.local_identifier,
          data.operational_status,
        ],
      );
      return mapSensor(result.rows[0]!);
    } catch (error) {
      // Corrida entre duas criações com o mesmo identificador na estação.
      if (isUniqueViolation(error)) throw new SensorConflictError();
      if (isForeignKeyViolation(error)) {
        throw new SensorConflictError("Station or sensor type not found.");
      }
      throw error;
    }
  }

  async findPaginated(filter?: SensorFilter): Promise<PaginatedResult<Sensor>> {
    const page = filter?.page ?? 1;
    const limit = filter?.limit ?? 20;
    const stationId = filter?.station_id ?? null;

    const [rows, count] = await Promise.all([
      this.pool.query<SensorRow>(
        `SELECT ${SENSOR_COLUMNS} FROM sensors
         WHERE ($1::int IS NULL OR station_id = $1)
         ORDER BY id ASC
         LIMIT $2 OFFSET $3`,
        [stationId, limit, (page - 1) * limit],
      ),
      this.pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM sensors
         WHERE ($1::int IS NULL OR station_id = $1)`,
        [stationId],
      ),
    ]);

    const totalRecords = count.rows[0]?.total ?? 0;
    return {
      data: rows.rows.map(mapSensor),
      meta: {
        total_records: totalRecords,
        total_pages: Math.ceil(totalRecords / limit) || 1,
        current_page: page,
      },
    };
  }

  async findById(id: number): Promise<Sensor | null> {
    const result = await this.pool.query<SensorRow>(
      `SELECT ${SENSOR_COLUMNS} FROM sensors WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapSensor(result.rows[0]) : null;
  }

  async findByStationAndIdentifier(
    stationId: number,
    localIdentifier: string,
  ): Promise<Sensor | null> {
    const result = await this.pool.query<SensorRow>(
      `SELECT ${SENSOR_COLUMNS} FROM sensors
       WHERE station_id = $1 AND lower(local_identifier) = lower($2)`,
      [stationId, localIdentifier],
    );
    return result.rows[0] ? mapSensor(result.rows[0]) : null;
  }

  async countBySensorTypeId(sensorTypeId: number): Promise<number> {
    const result = await this.pool.query<{ total: number }>(
      "SELECT COUNT(*)::int AS total FROM sensors WHERE sensor_type_id = $1",
      [sensorTypeId],
    );
    return result.rows[0]?.total ?? 0;
  }

  async update(id: number, data: SensorUpdateData): Promise<Sensor | null> {
    try {
      const result = await this.pool.query<SensorRow>(
        `UPDATE sensors SET
           station_id = COALESCE($2, station_id),
           sensor_type_id = COALESCE($3, sensor_type_id),
           local_identifier = COALESCE($4, local_identifier),
           operational_status = COALESCE($5, operational_status)
         WHERE id = $1
         RETURNING ${SENSOR_COLUMNS}`,
        [
          id,
          data.station_id ?? null,
          data.sensor_type_id ?? null,
          data.local_identifier ?? null,
          data.operational_status ?? null,
        ],
      );
      return result.rows[0] ? mapSensor(result.rows[0]) : null;
    } catch (error) {
      if (isUniqueViolation(error)) throw new SensorConflictError();
      throw error;
    }
  }

  async delete(id: number): Promise<boolean> {
    try {
      const result = await this.pool.query(
        "DELETE FROM sensors WHERE id = $1",
        [id],
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      // alert_configs.sensor_id não tem ON DELETE: o banco barra a exclusão.
      if (isForeignKeyViolation(error)) {
        throw new SensorConflictError(
          "Sensor has alert configurations. Remove them before deleting the sensor.",
        );
      }
      throw error;
    }
  }

  async stationExists(stationId: number): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM stations WHERE id = $1",
      [stationId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async sensorTypeExists(sensorTypeId: number): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM sensor_types WHERE id = $1",
      [sensorTypeId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

/** Compatibilidade: `new SensorRepository()` continua criando o em memória. */
export const SensorRepository = InMemorySensorRepository;
