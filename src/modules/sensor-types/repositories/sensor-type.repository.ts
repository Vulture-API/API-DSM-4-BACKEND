import type { Pool } from "pg";

import { database } from "@/config/database.js";
import { SensorTypeConflictError } from "@/modules/sensor-types/errors/sensor-type-conflict.error.js";
import type { SensorType } from "@/modules/sensor-types/types/sensor-type.type.js";

export interface SensorTypeRepository {
  create(data: Omit<SensorType, "id">): Promise<SensorType>;
  findAll(): Promise<SensorType[]>;
  findById(id: number): Promise<SensorType | null>;
  findByName(name: string): Promise<SensorType | null>;
  update(
    id: number,
    data: Partial<Omit<SensorType, "id">>,
  ): Promise<SensorType | null>;
  delete(id: number): Promise<boolean>;
}

export class InMemorySensorTypeRepository implements SensorTypeRepository {
  private readonly sensorTypes: SensorType[] = [];
  private nextId = 1;

  async create(data: Omit<SensorType, "id">): Promise<SensorType> {
    const sensorType: SensorType = {
      id: this.nextId++,
      name: data.name,
      unit_of_measure: data.unit_of_measure,
      factor: data.factor ?? null,
      gain: data.gain ?? null,
      offset_value: data.offset_value ?? null,
    };

    this.sensorTypes.push(sensorType);
    return sensorType;
  }

  async findAll(): Promise<SensorType[]> {
    return [...this.sensorTypes];
  }

  async findById(id: number): Promise<SensorType | null> {
    const found = this.sensorTypes.find((item) => item.id === id);
    return found ? { ...found } : null;
  }

  async findByName(name: string): Promise<SensorType | null> {
    const found = this.sensorTypes.find(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    );
    return found ? { ...found } : null;
  }

  async update(
    id: number,
    data: Partial<Omit<SensorType, "id">>,
  ): Promise<SensorType | null> {
    const index = this.sensorTypes.findIndex((item) => item.id === id);
    if (index === -1) {
      return null;
    }

    const current = this.sensorTypes[index]!;
    const updated: SensorType = {
      id: current.id,
      name: data.name ?? current.name,
      unit_of_measure: data.unit_of_measure ?? current.unit_of_measure,
      factor: data.factor !== undefined ? data.factor : current.factor,
      gain: data.gain !== undefined ? data.gain : current.gain,
      offset_value:
        data.offset_value !== undefined
          ? data.offset_value
          : current.offset_value,
    };

    this.sensorTypes[index] = updated;
    return { ...updated };
  }

  async delete(id: number): Promise<boolean> {
    const index = this.sensorTypes.findIndex((item) => item.id === id);
    if (index === -1) {
      return false;
    }

    this.sensorTypes.splice(index, 1);
    return true;
  }
}

const SENSOR_TYPE_COLUMNS =
  "id, name, unit_of_measure, factor::float8 AS factor, gain::float8 AS gain, offset_value::float8 AS offset_value";

export class PgSensorTypeRepository implements SensorTypeRepository {
  private tableChecked = false;

  constructor(private readonly pool: Pool = database) {}

  private async ensureTable(): Promise<void> {
    if (this.tableChecked) return;
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS sensor_types (
          id SERIAL PRIMARY KEY,
          name VARCHAR(50) NOT NULL UNIQUE,
          unit_of_measure VARCHAR(20) NOT NULL,
          factor NUMERIC,
          gain NUMERIC,
          offset_value NUMERIC
        );
      `);
      this.tableChecked = true;
    } catch {
      this.tableChecked = true;
    }
  }

  async create(data: Omit<SensorType, "id">): Promise<SensorType> {
    await this.ensureTable();
    const result = await this.pool.query<SensorType>(
      `
        INSERT INTO sensor_types (name, unit_of_measure, factor, gain, offset_value)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING ${SENSOR_TYPE_COLUMNS}
      `,
      [
        data.name,
        data.unit_of_measure,
        data.factor ?? null,
        data.gain ?? null,
        data.offset_value ?? null,
      ],
    );

    return result.rows[0]!;
  }

  async findAll(): Promise<SensorType[]> {
    await this.ensureTable();
    const result = await this.pool.query<SensorType>(
      `
        SELECT ${SENSOR_TYPE_COLUMNS}
        FROM sensor_types
        ORDER BY id ASC
      `,
    );

    return result.rows;
  }

  async findById(id: number): Promise<SensorType | null> {
    await this.ensureTable();
    const result = await this.pool.query<SensorType>(
      `
        SELECT ${SENSOR_TYPE_COLUMNS}
        FROM sensor_types
        WHERE id = $1
      `,
      [id],
    );

    return result.rows[0] ?? null;
  }

  async findByName(name: string): Promise<SensorType | null> {
    await this.ensureTable();
    const result = await this.pool.query<SensorType>(
      `
        SELECT ${SENSOR_TYPE_COLUMNS}
        FROM sensor_types
        WHERE LOWER(name) = LOWER($1)
      `,
      [name],
    );

    return result.rows[0] ?? null;
  }

  async update(
    id: number,
    data: Partial<Omit<SensorType, "id">>,
  ): Promise<SensorType | null> {
    await this.ensureTable();
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const name = data.name ?? existing.name;
    const unitOfMeasure = data.unit_of_measure ?? existing.unit_of_measure;
    const factor = data.factor !== undefined ? data.factor : existing.factor;
    const gain = data.gain !== undefined ? data.gain : existing.gain;
    const offsetValue =
      data.offset_value !== undefined
        ? data.offset_value
        : existing.offset_value;

    const result = await this.pool.query<SensorType>(
      `
        UPDATE sensor_types
        SET name = $2,
            unit_of_measure = $3,
            factor = $4,
            gain = $5,
            offset_value = $6
        WHERE id = $1
        RETURNING ${SENSOR_TYPE_COLUMNS}
      `,
      [id, name, unitOfMeasure, factor, gain, offsetValue],
    );

    return result.rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    await this.ensureTable();
    try {
      const result = await this.pool.query(
        `DELETE FROM sensor_types WHERE id = $1`,
        [id],
      );

      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      // sensors.sensor_type_id é ON DELETE RESTRICT: sem isso virava 500.
      if ((error as { code?: string }).code === "23503") {
        throw new SensorTypeConflictError(
          "Cannot delete sensor type associated with existing sensors (ON DELETE RESTRICT).",
        );
      }
      throw error;
    }
  }
}

/** Fallback compatível para construtor direto */
export const SensorTypeRepository = InMemorySensorTypeRepository;
