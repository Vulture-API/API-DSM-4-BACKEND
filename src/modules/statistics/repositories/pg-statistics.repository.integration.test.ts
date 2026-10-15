import { Pool, types } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PgStatisticsRepository } from "@/modules/statistics/repositories/pg-statistics.repository.js";

// Roda só com TEST_DATABASE_URL (o CI sobe um Postgres), num schema próprio.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const SCHEMA = `it_statistics_${process.pid}`;

types.setTypeParser(types.builtins.INT8, (value) => Number(value));

describe.skipIf(!TEST_DATABASE_URL)(
  "PgStatisticsRepository (Postgres real)",
  () => {
    let pool: Pool;
    let repository: PgStatisticsRepository;
    const base = 1_790_000_000;

    beforeAll(async () => {
      const admin = new Pool({ connectionString: TEST_DATABASE_URL });
      await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await admin.query(`CREATE SCHEMA ${SCHEMA}`);
      await admin.query(`
        SET search_path = ${SCHEMA};
        CREATE TABLE stations (id int PRIMARY KEY, property_id int NOT NULL);
        CREATE TABLE sensor_types (id int PRIMARY KEY, name text, unit_of_measure text);
        CREATE TABLE sensors (id int PRIMARY KEY, station_id int, sensor_type_id int);
        CREATE TABLE readings (
          id bigserial PRIMARY KEY, sensor_id int, value decimal(10,2),
          unix_time bigint, data_consistent boolean DEFAULT true
        );
        INSERT INTO stations VALUES (1, 1), (2, 2);
        INSERT INTO sensor_types VALUES (1, 'Temperatura', '°C'), (2, 'Umidade', '%');
        INSERT INTO sensors VALUES (10, 1, 1), (11, 1, 2), (20, 2, 1);
        INSERT INTO readings (sensor_id, value, unix_time, data_consistent) VALUES
          (10, 20, ${base} + 10, true),
          (10, 30, ${base} + 20, true),
          (10, 99, ${base} + 30, false),
          (11, 60, ${base} + 40, true),
          (20, 10, ${base} + 50, true),
          (20, 50, ${base} + 5000, true);
      `);
      await admin.end();

      pool = new Pool({
        connectionString: TEST_DATABASE_URL,
        options: `-c search_path=${SCHEMA}`,
      });
      repository = new PgStatisticsRepository(pool);
    });

    afterAll(async () => {
      await pool?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await pool?.end();
    });

    it("agrega por tipo de sensor ignorando leituras inconsistentes", async () => {
      const rows = await repository.summarize({
        from_unix: base,
        to_unix: base + 1000,
      });

      expect(rows).toEqual([
        {
          sensor_type_id: 1,
          sensor_type: "Temperatura",
          unit_of_measure: "°C",
          count: 3,
          avg: 20,
          min: 10,
          max: 30,
          stddev: 10,
          first_reading_at: new Date((base + 10) * 1000),
          last_reading_at: new Date((base + 50) * 1000),
        },
        expect.objectContaining({
          sensor_type: "Umidade",
          count: 1,
          avg: 60,
          stddev: null,
        }),
      ]);
    });

    it("filtra por estação, propriedade e fim exclusivo do período", async () => {
      const station = await repository.summarize({
        station_id: 1,
        from_unix: base,
        to_unix: base + 20,
      });
      expect(station).toEqual([expect.objectContaining({ count: 1, avg: 20 })]);

      const property = await repository.summarize({
        property_id: 2,
        from_unix: base,
        to_unix: base + 10_000,
      });
      expect(property).toEqual([
        expect.objectContaining({ count: 2, min: 10, max: 50 }),
      ]);
    });

    it("confere se a estação existe", async () => {
      expect(await repository.stationExists(1)).toBe(true);
      expect(await repository.stationExists(9)).toBe(false);
    });
  },
);
