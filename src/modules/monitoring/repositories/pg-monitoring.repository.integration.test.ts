import { Pool, types } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PgMonitoringRepository } from "@/modules/monitoring/repositories/pg-monitoring.repository.js";

// Roda só com TEST_DATABASE_URL (o CI sobe um Postgres), num schema próprio.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const SCHEMA = `it_monitoring_${process.pid}`;

types.setTypeParser(types.builtins.INT8, (value) => Number(value));

describe.skipIf(!TEST_DATABASE_URL)(
  "PgMonitoringRepository (Postgres real)",
  () => {
    let pool: Pool;
    let repository: PgMonitoringRepository;
    const base = 1_790_000_000 - (1_790_000_000 % 3600); // início de uma hora

    beforeAll(async () => {
      const admin = new Pool({ connectionString: TEST_DATABASE_URL });
      await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await admin.query(`CREATE SCHEMA ${SCHEMA}`);
      await admin.query(`
        SET search_path = ${SCHEMA};
        CREATE TABLE properties (id int PRIMARY KEY, name text NOT NULL);
        CREATE TABLE stations (
          id int PRIMARY KEY, property_id int NOT NULL, mac_address text,
          name text, latitude decimal(10,8), longitude decimal(11,8),
          last_communication_at timestamp
        );
        CREATE TABLE sensor_types (id int PRIMARY KEY, name text, unit_of_measure text);
        CREATE TABLE sensors (
          id int PRIMARY KEY, station_id int, sensor_type_id int,
          local_identifier text, operational_status boolean DEFAULT true
        );
        CREATE TABLE readings (
          id bigserial PRIMARY KEY, sensor_id int, value decimal(10,2),
          unix_time bigint, data_consistent boolean DEFAULT true
        );
        CREATE TABLE alert_configs (id int PRIMARY KEY, sensor_id int);
        CREATE TABLE triggered_alerts (
          id bigserial PRIMARY KEY, alert_config_id int, reading_id bigint,
          acknowledged_at timestamp
        );
        INSERT INTO properties VALUES (1, 'Fazenda A'), (2, 'Fazenda B');
        INSERT INTO stations VALUES
          (1, 1, 'AA', 'Beta', -23.1, -45.9, '2026-09-25 11:58:00'),
          (2, 2, 'BB', 'Alfa', NULL, NULL, NULL);
        INSERT INTO sensor_types VALUES (1, 'Temperatura', '°C'), (2, 'Umidade', '%');
        INSERT INTO sensors VALUES
          (10, 1, 1, 'temp', true), (11, 1, 2, 'umid', false), (20, 2, 1, 'temp', true),
          (21, 2, 2, 'umid', true);
        INSERT INTO readings (sensor_id, value, unix_time, data_consistent) VALUES
          (10, 20, ${base} + 60, true),
          (10, 30, ${base} + 120, true),
          (10, 99, ${base} + 180, false),
          (10, 25, ${base} + 3700, true),
          (11, 60, ${base} + 100, true),
          (20, 10, ${base} + 100, true),
          (21, 55, ${base} + 200, false);
        INSERT INTO alert_configs VALUES (1, 10);
        INSERT INTO triggered_alerts (alert_config_id, reading_id, acknowledged_at) VALUES
          (1, 1, NULL), (1, 2, NULL), (1, 4, now());
      `);
      await admin.end();

      pool = new Pool({
        connectionString: TEST_DATABASE_URL,
        options: `-c search_path=${SCHEMA}`,
      });
      repository = new PgMonitoringRepository(pool);
    });

    afterAll(async () => {
      await pool?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await pool?.end();
    });

    it("monta o snapshot com sensores, alertas pendentes e última leitura", async () => {
      const snapshots = await repository.listSnapshots();

      expect(snapshots.map((s) => s.name)).toEqual(["Alfa", "Beta"]);
      const beta = snapshots[1]!;
      expect(beta).toMatchObject({
        id: 1,
        property_name: "Fazenda A",
        latitude: -23.1,
        sensors_total: 2,
        sensors_active: 1,
        active_alerts: 2,
      });
      expect(beta.latest_readings).toEqual([
        {
          sensor_id: 10,
          local_identifier: "temp",
          sensor_type_id: 1,
          sensor_type: "Temperatura",
          unit_of_measure: "°C",
          value: 25,
          unix_time: base + 3700,
        },
        {
          sensor_id: 11,
          local_identifier: "umid",
          sensor_type_id: 2,
          sensor_type: "Umidade",
          unit_of_measure: "%",
          value: 60,
          unix_time: base + 100,
        },
      ]);
      expect(snapshots[0]!.active_alerts).toBe(0);
    });

    it("filtra por propriedade", async () => {
      const snapshots = await repository.listSnapshots(2);

      expect(snapshots.map((s) => s.id)).toEqual([2]);
    });

    it("agrega a série por intervalo ignorando leituras inconsistentes", async () => {
      const series = await repository.readingSeries({
        station_id: 1,
        from_unix: base,
        bucket_seconds: 3600,
      });

      expect(series).toEqual([
        {
          sensor_type_id: 1,
          sensor_type: "Temperatura",
          unit_of_measure: "°C",
          points: [
            { t: base, avg: 25, min: 20, max: 30 },
            { t: base + 3600, avg: 25, min: 25, max: 25 },
          ],
        },
        {
          sensor_type_id: 2,
          sensor_type: "Umidade",
          unit_of_measure: "%",
          points: [{ t: base, avg: 60, min: 60, max: 60 }],
        },
      ]);
    });

    it("filtra a série por propriedade e janela", async () => {
      const series = await repository.readingSeries({
        property_id: 2,
        from_unix: base + 50,
        bucket_seconds: 3600,
      });

      expect(series).toHaveLength(1);
      expect(series[0]!.points).toEqual([
        { t: base, avg: 10, min: 10, max: 10 },
      ]);
    });

    it("confere se a estação existe", async () => {
      expect(await repository.stationExists(1)).toBe(true);
      expect(await repository.stationExists(9)).toBe(false);
    });

    it("lista a última leitura consistente de cada sensor por estação", async () => {
      const rows = await repository.listCurrent({});

      expect(rows.map((r) => r.name)).toEqual(["Alfa", "Beta"]);
      const beta = rows[1]!;
      expect(beta).toMatchObject({
        id: 1,
        property_name: "Fazenda A",
        active_alerts: 2,
      });
      expect(beta.readings.map((r) => [r.sensor_id, r.value])).toEqual([
        [10, 25],
        [11, 60],
      ]);
      // A única leitura do sensor 21 é inconsistente: entra sem valor.
      expect(rows[0]!.readings).toEqual([
        expect.objectContaining({ sensor_id: 20, value: 10 }),
        expect.objectContaining({
          sensor_id: 21,
          value: null,
          unix_time: null,
        }),
      ]);
    });

    it("filtra os dados atuais por estação e propriedade", async () => {
      expect(
        (await repository.listCurrent({ station_id: 1 })).map((r) => r.id),
      ).toEqual([1]);
      expect(
        (await repository.listCurrent({ property_id: 2 })).map((r) => r.id),
      ).toEqual([2]);
    });

    it("lê as leituras novas a partir de um id, sem as inconsistentes", async () => {
      expect(await repository.lastReadingId()).toBe(7);

      const after = await repository.readingsAfter(3, 10);
      expect(after.map((r) => r.reading_id)).toEqual([4, 5, 6]);
      expect(after[0]).toEqual({
        reading_id: 4,
        station_id: 1,
        sensor_id: 10,
        local_identifier: "temp",
        sensor_type_id: 1,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        value: 25,
        unix_time: base + 3700,
      });
      expect(await repository.readingsAfter(0, 2)).toHaveLength(2);
    });
  },
);
