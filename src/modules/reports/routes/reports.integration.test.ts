import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { buildApp } from "@/app.js";
import type { ForecastProvider } from "@/modules/forecast/providers/forecast.provider.js";
import { hashPassword } from "@/modules/users/services/password-hasher.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const SCHEMA = `it_scrum561_${randomUUID().replaceAll("-", "")}`;
const PASSWORD = "scrum561-test-password";
const FIXED_NOW = new Date("2026-10-20T12:00:00.000Z");

function toUnix(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

// SCRUM-561: HTTP -> Auth + PropertyScope -> Controller -> Service -> PgReportRepository -> PostgreSQL.
describe.skipIf(!TEST_DATABASE_URL)(
  "integracao real das rotas de relatorios com PostgreSQL (/api/reports)",
  () => {
    let pool: Pool;
    let app: FastifyInstance;
    let adminHeaders: { authorization: string };
    let managerHeaders: { authorization: string };
    let noPermHeaders: { authorization: string };

    const stubForecastProvider: ForecastProvider = {
      source: "open-meteo-test",
      async daily({ days }) {
        return [
          {
            date: "2026-10-21",
            temperature_max: 29.4,
            temperature_min: 18.2,
            precipitation_mm: 0,
            precipitation_probability: 10,
            wind_speed_max_kmh: 14,
            weather_code: 0,
          },
          {
            date: "2026-10-22",
            temperature_max: 24.1,
            temperature_min: 17.5,
            precipitation_mm: 8.6,
            precipitation_probability: 75,
            wind_speed_max_kmh: 21,
            weather_code: 61,
          },
        ].slice(0, days);
      },
    };

    beforeAll(async () => {
      const setup = new Pool({ connectionString: TEST_DATABASE_URL });
      try {
        await setup.query(`
          CREATE SCHEMA ${SCHEMA};
          SET search_path = ${SCHEMA};
          CREATE TABLE roles (
            id integer PRIMARY KEY,
            name varchar(50) NOT NULL UNIQUE
          );
          CREATE TABLE users (
            id integer PRIMARY KEY,
            role_id integer NOT NULL REFERENCES roles(id),
            name varchar(150) NOT NULL,
            active boolean NOT NULL DEFAULT true,
            created_at timestamp NOT NULL DEFAULT current_timestamp
          );
          CREATE TABLE credentials (
            user_id integer PRIMARY KEY REFERENCES users(id),
            email varchar(150) NOT NULL UNIQUE,
            password_hash varchar(255) NOT NULL
          );
          CREATE TABLE permissions (
            code varchar(100) PRIMARY KEY
          );
          CREATE TABLE role_permissions (
            role_id integer REFERENCES roles(id),
            permission_code varchar(100) REFERENCES permissions(code),
            PRIMARY KEY (role_id, permission_code)
          );
          CREATE TABLE properties (
            id integer PRIMARY KEY,
            name varchar(150) NOT NULL
          );
          CREATE TABLE user_properties (
            user_id integer REFERENCES users(id),
            property_id integer REFERENCES properties(id),
            PRIMARY KEY (user_id, property_id)
          );
          CREATE TABLE stations (
            id integer PRIMARY KEY,
            property_id integer NOT NULL REFERENCES properties(id),
            name varchar(100) NOT NULL,
            latitude double precision,
            longitude double precision
          );
          CREATE TABLE sensor_types (
            id integer PRIMARY KEY,
            name varchar(50) NOT NULL,
            unit_of_measure varchar(20) NOT NULL
          );
          CREATE TABLE sensors (
            id integer PRIMARY KEY,
            station_id integer NOT NULL REFERENCES stations(id),
            sensor_type_id integer NOT NULL REFERENCES sensor_types(id)
          );
          CREATE TABLE readings (
            id bigint PRIMARY KEY,
            sensor_id integer NOT NULL REFERENCES sensors(id),
            value numeric NOT NULL,
            unix_time bigint NOT NULL,
            data_consistent boolean NOT NULL DEFAULT true
          );
          CREATE TABLE alert_configs (
            id integer PRIMARY KEY,
            sensor_id integer NOT NULL REFERENCES sensors(id),
            comparison_operator varchar(10) NOT NULL,
            reference_value numeric NOT NULL,
            message text
          );
          CREATE TABLE triggered_alerts (
            id bigint PRIMARY KEY,
            alert_config_id integer NOT NULL REFERENCES alert_configs(id),
            reading_id bigint NOT NULL REFERENCES readings(id),
            triggered_at timestamp NOT NULL,
            acknowledged_at timestamp
          );

          INSERT INTO roles VALUES
            (1, 'Administrador'),
            (2, 'Gerente Agricola'),
            (3, 'Sem Leitura');
          INSERT INTO users (id, role_id, name) VALUES
            (1, 1, 'Admin QA'),
            (2, 2, 'Gerente Fazenda Norte'),
            (3, 3, 'Usuario Sem Permissao');
          INSERT INTO permissions VALUES ('monitoring.read');
          INSERT INTO role_permissions VALUES
            (1, 'monitoring.read'),
            (2, 'monitoring.read');
          INSERT INTO properties VALUES
            (1, 'Fazenda Norte'),
            (2, 'Fazenda Sul');
          INSERT INTO user_properties VALUES (2, 1);
          INSERT INTO stations VALUES
            (10, 1, 'Estacao Sede', -23.1896, -45.8841),
            (11, 1, 'Estacao Sem GPS', NULL, NULL),
            (20, 2, 'Estacao Sul', -22.90, -47.06);
          INSERT INTO sensor_types VALUES
            (1, 'Temperatura', '°C'),
            (2, 'Índice Pluviométrico', 'mm');
          INSERT INTO sensors VALUES
            (100, 10, 1),
            (101, 10, 2),
            (200, 20, 1);
          INSERT INTO readings (id, sensor_id, value, unix_time, data_consistent) VALUES
            (1, 100, 18.0, ${toUnix("2026-09-28T12:00:00.000Z")}, true),
            (2, 100, 24.5, ${toUnix("2026-10-03T08:00:00.000Z")}, true),
            (3, 100, 28.5, ${toUnix("2026-10-08T18:30:00.000Z")}, true),
            (4, 101, 12.4, ${toUnix("2026-10-05T14:00:00.000Z")}, true),
            (5, 200, 31.0, ${toUnix("2026-10-06T12:00:00.000Z")}, true),
            (6, 100, 33.0, ${toUnix("2026-10-15T10:00:00.000Z")}, true);
          INSERT INTO alert_configs (id, sensor_id, comparison_operator, reference_value, message) VALUES
            (1, 100, '>', 30, 'Calor excessivo'),
            (2, 100, '<', 15, '   '),
            (3, 200, '>', 29, 'Calor Fazenda Sul');
          INSERT INTO triggered_alerts (id, alert_config_id, reading_id, triggered_at, acknowledged_at) VALUES
            (10, 1, 1, '2026-09-28 12:00:00', NULL),
            (11, 2, 2, '2026-10-01 01:30:00', NULL),
            (12, 1, 3, '2026-10-08 18:30:00', '2026-10-08 19:00:00'),
            (13, 3, 5, '2026-10-06 12:00:00', NULL);
        `);
        const hash = await hashPassword(PASSWORD);
        await setup.query(
          `INSERT INTO ${SCHEMA}.credentials (user_id, email, password_hash) VALUES
            (1, 'admin.scrum561@agritech.dev', $1),
            (2, 'gerente.scrum561@agritech.dev', $1),
            (3, 'semperm.scrum561@agritech.dev', $1)`,
          [hash],
        );
      } finally {
        await setup.end();
      }

      pool = new Pool({
        connectionString: TEST_DATABASE_URL,
        options: `-c search_path=${SCHEMA} -c TimeZone=America/Sao_Paulo`,
      });
    });

    beforeEach(async () => {
      app = buildApp({
        database: pool,
        accessControlEnabled: true,
        jwtSecret: "scrum561-postgres-integration-secret",
        forecastProvider: stubForecastProvider,
        clock: () => FIXED_NOW,
      });
      adminHeaders = await login("admin.scrum561@agritech.dev");
      managerHeaders = await login("gerente.scrum561@agritech.dev");
      noPermHeaders = await login("semperm.scrum561@agritech.dev");
    });

    afterEach(async () => {
      await app?.close();
    });

    afterAll(async () => {
      const cleanup = new Pool({ connectionString: TEST_DATABASE_URL });
      try {
        await pool?.end();
        await cleanup.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      } finally {
        await cleanup.end();
      }
    });

    async function login(email: string) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email, password: PASSWORD },
      });
      expect(response.statusCode).toBe(200);
      return { authorization: `Bearer ${response.json().access_token}` };
    }

    it("filtra historico por periodo no PostgreSQL respeitando escopo de propriedade do gerente", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/reports?type=history&from=2026-10-01&to=2026-10-10",
        headers: managerHeaders,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.total_readings).toBe(3);
      expect(body.readings.map((item: { id: number }) => item.id)).toEqual([
        2, 4, 3,
      ]);
      expect(body.summary).toEqual([
        {
          sensor_type_id: 1,
          sensor_type: "Temperatura",
          unit_of_measure: "°C",
          count: 2,
          avg: 26.5,
          min: 24.5,
          max: 28.5,
          stddev: 2,
          accumulated: null,
        },
        {
          sensor_type_id: 2,
          sensor_type: "Índice Pluviométrico",
          unit_of_measure: "mm",
          count: 1,
          avg: 12.4,
          min: 12.4,
          max: 12.4,
          stddev: null,
          accumulated: 12.4,
        },
      ]);

      const leakedProperty = await app.inject({
        method: "GET",
        url: "/api/reports?type=history&property_id=2&from=2026-10-01&to=2026-10-10",
        headers: managerHeaders,
      });
      expect(leakedProperty.statusCode).toBe(200);
      expect(leakedProperty.json().total_readings).toBe(0);
    });

    it("permite ao Administrador consultar todas as propriedades e filtrar por property_id via POST", async () => {
      const allProperties = await app.inject({
        method: "GET",
        url: "/api/reports?type=history&from=2026-10-01&to=2026-10-10",
        headers: adminHeaders,
      });
      expect(allProperties.statusCode).toBe(200);
      expect(
        allProperties.json().readings.map((item: { id: number }) => item.id),
      ).toEqual([2, 4, 5, 3]);

      const onlySul = await app.inject({
        method: "POST",
        url: "/api/reports",
        headers: adminHeaders,
        payload: {
          type: "history",
          property_id: 2,
          from: "2026-10-01",
          to: "2026-10-10",
        },
      });
      expect(onlySul.statusCode).toBe(200);
      expect(onlySul.json()).toMatchObject({
        property: { id: 2, name: "Fazenda Sul" },
        total_readings: 1,
      });
      expect(onlySul.json().readings[0].id).toBe(5);
    });

    it("consulta alertas em UTC independente da TimeZone da sessao do PostgreSQL", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/reports?type=alerts&from=2026-10-01&to=2026-10-10",
        headers: managerHeaders,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.total_alerts).toBe(2);
      expect(body.alerts).toEqual([
        expect.objectContaining({
          id: 12,
          rule_name: "Calor excessivo",
          status: "acknowledged",
          triggered_at: "2026-10-08T18:30:00.000Z",
        }),
        expect.objectContaining({
          id: 11,
          rule_name: "Alerta #2",
          status: "pending",
          triggered_at: "2026-10-01T01:30:00.000Z",
        }),
      ]);
    });

    it("gera previsao usando coordenadas reais da estacao no PostgreSQL e rejeita estacao sem GPS", async () => {
      const forecast = await app.inject({
        method: "POST",
        url: "/api/reports",
        headers: managerHeaders,
        payload: { type: "forecast", station_id: 10, days: 2 },
      });
      expect(forecast.statusCode).toBe(200);
      expect(forecast.json()).toMatchObject({
        report_type: "forecast",
        source: "open-meteo-test",
        station: {
          id: 10,
          name: "Estacao Sede",
          latitude: -23.1896,
          longitude: -45.8841,
        },
        property: { id: 1, name: "Fazenda Norte" },
        total_days: 2,
      });

      const noGps = await app.inject({
        method: "GET",
        url: "/api/reports?type=forecast&station_id=11",
        headers: managerHeaders,
      });
      expect(noGps.statusCode).toBe(422);
      expect(noGps.json().code).toBe("STATION_WITHOUT_COORDINATES");
    });

    it("recusa acesso sem token (401) ou sem permissao monitoring.read (403)", async () => {
      const anon = await app.inject({
        method: "GET",
        url: "/api/reports?type=history&from=2026-10-01&to=2026-10-10",
      });
      expect(anon.statusCode).toBe(401);

      const forbidden = await app.inject({
        method: "GET",
        url: "/api/reports?type=history&from=2026-10-01&to=2026-10-10",
        headers: noPermHeaders,
      });
      expect(forbidden.statusCode).toBe(403);
    });
  },
);
