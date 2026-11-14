import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { buildApp } from "@/app.js";
import { PgMonitoringRepository } from "@/modules/monitoring/repositories/pg-monitoring.repository.js";
import { ReadingsBroadcaster } from "@/modules/monitoring/services/readings-broadcaster.js";
import { PERMISSIONS } from "@/modules/permissions/permission-catalog.js";

const url = process.env.TEST_DATABASE_URL;
const schema = `it_scope_${randomUUID().replaceAll("-", "")}`;
describe.skipIf(!url)(
  "SCRUM-617: escopo por propriedade com PostgreSQL real",
  () => {
    let pool: Pool;
    let app: FastifyInstance;
    const headers = (id: number) => ({
      authorization: `Bearer ${app.jwt.sign({ sub: String(id) })}`,
    });
    beforeAll(async () => {
      const admin = new Pool({ connectionString: url });
      await admin.query(`CREATE SCHEMA ${schema}`);
      await admin.end();
      pool = new Pool({
        connectionString: url,
        options: `-c search_path=${schema}`,
      });
      await pool.query(
        readFileSync(
          new URL("./testing/property-scope-schema.sql", import.meta.url),
          "utf8",
        ),
      );
      await pool.query(
        "INSERT INTO permissions SELECT * FROM unnest($1::text[], $2::text[])",
        [PERMISSIONS.map((p) => p.code), PERMISSIONS.map((p) => p.description)],
      );
      await pool.query(
        "INSERT INTO roles(id,name) VALUES(99,'Administrador'),(12,'Gerente Agrícola'),(77,'Cliente')",
      );
      // Cliente recebe deliberadamente concessões de escrita: devem ser recusadas.
      await pool.query(
        "INSERT INTO role_permissions SELECT r.id,p.code FROM roles r CROSS JOIN permissions p",
      );
      app = buildApp({
        database: pool,
        accessControlEnabled: true,
        jwtSecret: "scrum396-property-scope-acceptance-secret",
        forecastProvider: { source: "test", daily: async () => [] },
        rateLimits: { max: 100000 },
      });
      await app.ready();
    });
    beforeEach(async () => {
      await pool.query(`TRUNCATE properties, users, stations, sensor_types CASCADE;
      INSERT INTO users(id,role_id,name) VALUES(1,99,'Admin'),(2,12,'Gerente'),(3,77,'Cliente'),(4,12,'Sem vínculos');
      INSERT INTO credentials(user_id,email,password_hash) SELECT id,'user'||id||'@test.dev','unused' FROM users;
      INSERT INTO properties(id,name,owner_user_id) VALUES(1,'Fazenda A',1),(2,'Fazenda B',1);
      SELECT setval(pg_get_serial_sequence('properties','id'),2);
      INSERT INTO user_properties VALUES(2,1),(3,2);
      INSERT INTO stations(id,property_id,name,mac_address) VALUES(1,1,'Estação A','AA'),(2,2,'Estação B','BB');
      INSERT INTO sensor_types VALUES(1,'Temperatura','C',1,1,0);
      INSERT INTO sensors(id,station_id,sensor_type_id,local_identifier) VALUES(1,1,1,'temp'),(2,2,1,'temp');
      INSERT INTO readings(id,sensor_id,value,unix_time) VALUES(1,1,11,extract(epoch FROM now())::bigint),(2,2,91,extract(epoch FROM now())::bigint);
      INSERT INTO alert_configs(id,manager_user_id,sensor_id,reference_value,comparison_operator,message) VALUES(1,2,1,10,'>','Alerta A'),(2,2,2,90,'>','Alerta B');
      INSERT INTO triggered_alerts(id,alert_config_id,reading_id) VALUES(1,1,1),(2,2,2);
      INSERT INTO occurrences(id,type,station_id,description) VALUES(1,'COMMUNICATION_FAILURE',1,'A'),(2,'COMMUNICATION_FAILURE',2,'B');`);
    });
    afterAll(async () => {
      await app?.close();
      await pool?.end();
      const admin = new Pool({ connectionString: url });
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    });
    const collections = [
      "/api/properties",
      "/properties",
      "/api/stations/properties",
      "/api/stations",
      "/sensors",
      "/v1/sensors",
      "/api/sensors",
      "/api/v1/sensors",
      "/api/readings",
      "/readings",
      "/api/v1/readings",
      "/api/meteorological-data",
      "/api/alerts/config",
      "/api/alerts/triggered",
      "/api/occurrences",
    ];
    it.each([1, 2, 3, 4])(
      "filtra todas as coleções e totais para o usuário %i",
      async (id) => {
        const expected =
          id === 1 ? [1, 2] : id === 2 ? [1] : id === 3 ? [2] : [];
        for (const path of collections) {
          const response = await app.inject({
            url: path,
            headers: headers(id),
          });
          expect(response.statusCode, path + response.body).toBe(200);
          const body = response.json();
          expect(
            (Array.isArray(body) ? body : body.data)
              .map((item: { id: number }) => item.id)
              .sort((a: number, b: number) => a - b),
            path,
          ).toEqual(expected);
          if (body.meta)
            expect(body.meta.total_records, path).toBe(expected.length);
        }
        for (const path of [
          "/api/stations/current",
          "/api/stations/overview",
        ]) {
          const response = await app.inject({
            url: path,
            headers: headers(id),
          });
          expect(response.statusCode, response.body).toBe(200);
          expect(
            response
              .json()
              .stations.map(
                (s: { id?: number; station_id?: number }) =>
                  s.id ?? s.station_id,
              ),
          ).toEqual(expected);
        }
        const stats = await app.inject({
          url: "/api/stations/statistics",
          headers: headers(id),
        });
        expect(stats.statusCode, stats.body).toBe(200);
        expect(stats.json().readings_total).toBe(expected.length);
        expect(
          stats.json().sensor_types.map((s: { avg: number }) => s.avg),
        ).toEqual(id === 4 ? [] : [id === 1 ? 51 : id === 2 ? 11 : 91]);
        const report = await app.inject({
          url: "/api/reports?type=history",
          headers: headers(id),
        });
        expect(report.statusCode, report.body).toBe(200);
        expect(report.json().total_readings).toBe(expected.length);
        expect(report.json().readings.map((r: { id: number }) => r.id)).toEqual(
          expected,
        );
        const series = await app.inject({
          url: "/api/stations/readings/series",
          headers: headers(id),
        });
        expect(series.statusCode, series.body).toBe(200);
        expect(
          series
            .json()
            .series.flatMap((s: { points: { avg: number }[] }) =>
              s.points.map((p) => p.avg),
            ),
        ).toEqual(id === 4 ? [] : [id === 1 ? 51 : id === 2 ? 11 : 91]);
      },
    );
    it.each([
      "/api/stations",
      "/api/stations/:id/current",
      "/api/stations/:id/status",
      "/api/stations/:id/collection",
      "/api/stations/:id/forecast",
      "/api/stations/:id/statistics",
      "/api/sensors",
      "/v1/sensors",
      "/api/alerts/config",
      "/api/occurrences",
      "/api/properties/:id/stations",
    ])(
      "mesmo 404 para inexistente e fora do escopo em %s",
      async (template) => {
        const path = (id: number) =>
          template.includes(":id")
            ? template.replace(":id", String(id))
            : template + "/" + id;
        expect(
          (await app.inject({ url: path(1), headers: headers(2) })).statusCode,
        ).toBe(200);
        const outside = await app.inject({ url: path(2), headers: headers(2) });
        const missing = await app.inject({
          url: path(999),
          headers: headers(2),
        });
        expect(outside.statusCode, outside.body).toBe(404);
        expect(outside.json()).toEqual(missing.json());
        expect(
          (await app.inject({ url: path(2), headers: headers(1) })).statusCode,
        ).toBe(200);
      },
    );
    it("nega alterações de Cliente mesmo com todas as permissões", async () => {
      for (const [method, path] of [
        ["POST", "/api/properties"],
        ["PUT", "/api/stations/2"],
        ["DELETE", "/api/sensors/2"],
        ["PUT", "/api/alerts/triggered/2/acknowledge"],
        ["PATCH", "/api/occurrences/2/resolve"],
      ] as const) {
        expect(
          (
            await app.inject({
              method,
              url: path,
              headers: headers(3),
              ...(method !== "DELETE" ? { payload: {} } : {}),
            })
          ).statusCode,
          path,
        ).toBe(403);
      }
      const report = await app.inject({
        method: "POST",
        url: "/api/reports",
        headers: headers(3),
        payload: { type: "history" },
      });
      expect(report.statusCode, report.body).toBe(200);
      expect(report.json().readings.map((r: { id: number }) => r.id)).toEqual([
        2,
      ]);
    });
    it("substitui vínculos atomicamente, valida entradas e restringe ao Administrador", async () => {
      for (const method of ["GET", "PUT"] as const)
        for (const id of [2, 3])
          expect(
            (
              await app.inject({
                method,
                url: "/api/users/2/properties",
                headers: headers(id),
                ...(method === "PUT" ? { payload: { property_ids: [2] } } : {}),
              })
            ).statusCode,
          ).toBe(403);
      const put = (ids: number[]) =>
        app.inject({
          method: "PUT",
          url: "/api/users/2/properties",
          headers: headers(1),
          payload: { property_ids: ids },
        });
      expect(
        (await put([2, 2])).json().map((p: { id: number }) => p.id),
      ).toEqual([2]);
      expect((await put([1, 999])).statusCode).toBe(404);
      expect(
        (
          await app.inject({
            url: "/api/users/2/properties",
            headers: headers(1),
          })
        )
          .json()
          .map((p: { id: number }) => p.id),
      ).toEqual([2]);
      expect((await put([-1])).statusCode).toBe(400);
      expect((await put([])).json()).toEqual([]);
      expect(
        (
          await app.inject({
            url: "/api/users/999/properties",
            headers: headers(1),
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await app.inject({ url: "/api/users/2/properties" })).statusCode,
      ).toBe(401);
    });
    it("revalida os vínculos com o mesmo token e isola requisições concorrentes", async () => {
      const token = headers(2);
      expect(
        (await app.inject({ url: "/api/auth/me", headers: token })).json(),
      ).toMatchObject({ role_name: "Gerente Agrícola", property_ids: [1] });
      await app.inject({
        method: "PUT",
        url: "/api/users/2/properties",
        headers: headers(1),
        payload: { property_ids: [2] },
      });
      const results = await Promise.all(
        [2, 3, 1, 4, 2, 3].map((id) =>
          app.inject({
            url: "/api/properties",
            headers: id === 2 ? token : headers(id),
          }),
        ),
      );
      expect(
        results.map((r) => r.json().map((p: { id: number }) => p.id)),
      ).toEqual([[2], [2], [1, 2], [], [2], [2]]);
    });
    it("vincula o Gerente criador e reverte a propriedade se o vínculo falhar", async () => {
      const create = () =>
        app.inject({
          method: "POST",
          url: "/api/properties",
          headers: headers(2),
          payload: { name: "Fazenda criada", owner_user_id: 1 },
        });
      const response = await create();
      expect(response.statusCode, response.body).toBe(201);
      expect(
        (
          await pool.query(
            "SELECT * FROM user_properties WHERE user_id=2 AND property_id=$1",
            [response.json().id],
          )
        ).rowCount,
      ).toBe(1);
      await pool.query(`CREATE FUNCTION reject_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced link failure'; END $$;
      CREATE TRIGGER reject_link BEFORE INSERT ON user_properties FOR EACH ROW EXECUTE FUNCTION reject_link()`);
      try {
        expect((await create()).statusCode).toBe(500);
      } finally {
        await pool.query(
          "DROP TRIGGER reject_link ON user_properties; DROP FUNCTION reject_link()",
        );
      }
      expect(
        (
          await pool.query(
            "SELECT * FROM properties WHERE name='Fazenda criada'",
          )
        ).rowCount,
      ).toBe(1);
    });
    it("valida origem e destino das associações e referências no corpo", async () => {
      const send = (path: string, body: Record<string, unknown>) =>
        app.inject({
          method: "PUT",
          url: path,
          headers: headers(2),
          payload: body,
        });
      for (const [path, body] of [
        ["/api/properties/1/stations/2", {}],
        ["/api/properties/2/stations/1", {}],
        ["/api/properties/1/stations", { station_ids: [1, 2] }],
        [
          "/api/sensors/1",
          {
            station_id: 2,
            sensor_type_id: 1,
            local_identifier: "temp",
            operational_status: true,
          },
        ],
      ] as const)
        expect((await send(path, body)).statusCode, path).toBe(404);
      expect(
        (await pool.query("SELECT property_id FROM stations WHERE id=2"))
          .rows[0].property_id,
      ).toBe(2);
    });
    it("preserva o modo legado e protege vínculos mesmo com a flag desligada", async () => {
      const legacy = buildApp({
        database: pool,
        accessControlEnabled: false,
        jwtSecret: "scrum396-property-scope-acceptance-secret",
      });
      try {
        expect(
          (await legacy.inject({ url: "/api/properties" })).json(),
        ).toHaveLength(2);
        expect(
          (await legacy.inject({ url: "/api/users/2/properties" })).statusCode,
        ).toBe(401);
        expect(
          (
            await legacy.inject({
              url: "/api/users/2/properties",
              headers: headers(2),
            })
          ).statusCode,
        ).toBe(403);
      } finally {
        await legacy.close();
      }
    });
    it("preserva escritas autorizadas dentro do escopo após aplicar os predicados SQL", async () => {
      for (const table of ["stations", "sensors", "alert_configs"])
        await pool.query(
          `SELECT setval(pg_get_serial_sequence('${table}','id'),2)`,
        );
      const send = async (
        method: "POST" | "PUT" | "PATCH" | "DELETE",
        url: string,
        payload: Record<string, unknown> | undefined,
        expected: number,
      ) => {
        const response = await app.inject({
          method,
          url,
          ...(payload === undefined ? {} : { payload }),
          headers: headers(2),
        });
        expect(response.statusCode, response.body).toBe(expected);
        return response.statusCode === 204 ? null : response.json();
      };
      const stationBody = {
        property_id: 1,
        mac_address: "02:00:00:00:00:03",
        name: "Estação permitida",
      };
      const station = await send("POST", "/api/stations", stationBody, 201);
      await send("PUT", `/api/stations/${station.id}`, stationBody, 200);
      await send(
        "PUT",
        `/api/stations/${station.id}/collection`,
        { collection_interval_seconds: 120 },
        200,
      );
      await send(
        "PUT",
        `/api/properties/1/stations/${station.id}`,
        undefined,
        200,
      );
      const sensorBody = {
        station_id: station.id,
        sensor_type_id: 1,
        local_identifier: "novo",
        operational_status: true,
      };
      const sensor = await send("POST", "/api/sensors", sensorBody, 201);
      await send(
        "PUT",
        `/api/sensors/${sensor.id}`,
        { ...sensorBody, operational_status: false },
        200,
      );
      const ruleBody = {
        sensor_id: sensor.id,
        reference_value: 42,
        comparison_operator: ">",
      };
      const rule = await send("POST", "/api/alerts/config", ruleBody, 201);
      await send(
        "PUT",
        `/api/alerts/config/${rule.id}`,
        { ...ruleBody, reference_value: 84 },
        200,
      );
      await send("PUT", "/api/alerts/triggered/1/acknowledge", {}, 200);
      await send("PATCH", "/api/occurrences/1/resolve", undefined, 200);
      await send("DELETE", `/api/alerts/config/${rule.id}`, undefined, 204);
      await send("DELETE", `/api/sensors/${sensor.id}`, undefined, 204);
      await send("DELETE", `/api/stations/${station.id}`, undefined, 204);
    });
    const concurrentOperations: {
      method: "GET" | "PUT" | "POST" | "PATCH" | "DELETE";
      url: string;
      payload?: Record<string, unknown>;
      statement?: string;
    }[] = [
      { method: "GET", url: "/api/stations/1" },
      { method: "GET", url: "/api/sensors/1" },
      { method: "GET", url: "/api/alerts/config/1" },
      { method: "GET", url: "/api/occurrences/1" },
      { method: "GET", url: "/api/stations/1/forecast" },
      { method: "GET", url: "/api/reports?type=history&station_id=1" },
      {
        method: "DELETE",
        url: "/api/stations/1",
        statement: "DELETE FROM stations",
      },
      {
        method: "DELETE",
        url: "/api/sensors/1",
        statement: "DELETE FROM sensors",
      },
      {
        method: "DELETE",
        url: "/api/alerts/config/1",
        statement: "DELETE FROM alert_configs",
      },
      {
        method: "PUT",
        url: "/api/stations/1",
        payload: {
          property_id: 1,
          mac_address: "02:00:00:00:00:01",
          name: "Estação alterada",
        },
        statement: "UPDATE stations",
      },
      {
        method: "PUT",
        url: "/api/stations/1/collection",
        payload: { collection_interval_seconds: 120 },
        statement: "UPDATE stations",
      },
      {
        method: "PUT",
        url: "/api/sensors/1",
        payload: {
          station_id: 1,
          sensor_type_id: 1,
          local_identifier: "temp",
          operational_status: false,
        },
        statement: "UPDATE sensors",
      },
      {
        method: "PUT",
        url: "/api/alerts/config/1",
        payload: {
          sensor_id: 1,
          reference_value: 99,
          comparison_operator: ">",
          active: false,
        },
        statement: "UPDATE alert_configs",
      },
      {
        method: "PUT",
        url: "/api/alerts/triggered/1/acknowledge",
        payload: {},
        statement: "UPDATE triggered_alerts",
      },
      {
        method: "PATCH",
        url: "/api/occurrences/1/resolve",
        statement: "UPDATE occurrences",
      },
      {
        method: "PUT",
        url: "/api/properties/1/stations/1",
        statement: "UPDATE stations",
      },
      {
        method: "POST",
        url: "/api/sensors",
        payload: {
          station_id: 1,
          sensor_type_id: 1,
          local_identifier: "novo",
          operational_status: true,
        },
        statement: "INSERT INTO sensors",
      },
      {
        method: "POST",
        url: "/api/alerts/config",
        payload: {
          sensor_id: 1,
          reference_value: 99,
          comparison_operator: ">",
        },
        statement: "INSERT INTO alert_configs",
      },
    ];
    it.each(concurrentOperations)(
      "nega $method $url se a estação mudar após o guard",
      async (operation) => {
        let moved = false;
        const proxy = {
          query: async (sql: string, values?: unknown[]) => {
            const result = await pool.query(sql, values);
            if (!moved && /^SELECT (?:st\.)?property_id FROM /.test(sql)) {
              moved = true;
              await pool.query("UPDATE stations SET property_id=2 WHERE id=1");
            }
            return result;
          },
          connect: () => pool.connect(),
        } as unknown as Pool;
        const raced = buildApp({
          database: proxy,
          accessControlEnabled: true,
          jwtSecret: "scrum396-property-scope-acceptance-secret",
        });
        try {
          const response = await raced.inject({
            ...operation,
            headers: headers(2),
          });
          expect(moved).toBe(true);
          expect(response.statusCode, response.body).toBe(404);
          expect(
            (await pool.query("SELECT property_id FROM stations WHERE id=1"))
              .rows[0].property_id,
          ).toBe(2);
        } finally {
          await raced.close();
        }
      },
    );
    it.each(concurrentOperations.filter((operation) => operation.statement))(
      "nega $method $url se a estação mudar imediatamente antes da escrita",
      async (operation) => {
        const before = await pool.query("SELECT * FROM sensors ORDER BY id");
        let moved = false;
        const proxy = {
          query: async (sql: string, values?: unknown[]) => {
            if (!moved && sql.trim().startsWith(operation.statement!)) {
              moved = true;
              await pool.query("UPDATE stations SET property_id=2 WHERE id=1");
            }
            return pool.query(sql, values);
          },
          connect: () => pool.connect(),
        } as unknown as Pool;
        const raced = buildApp({
          database: proxy,
          accessControlEnabled: true,
          jwtSecret: "scrum396-property-scope-acceptance-secret",
        });
        try {
          const response = await raced.inject({
            ...operation,
            headers: headers(2),
          });
          expect(moved).toBe(true);
          expect(response.statusCode, response.body).toBe(404);
          expect(
            (await pool.query("SELECT * FROM sensors ORDER BY id")).rows,
          ).toEqual(before.rows);
          expect(
            (
              await pool.query(
                "SELECT collection_interval_seconds FROM stations WHERE id=1",
              )
            ).rows[0].collection_interval_seconds,
          ).toBe(60);
          expect(
            (
              await pool.query(
                "SELECT acknowledged_at FROM triggered_alerts WHERE id=1",
              )
            ).rows[0].acknowledged_at,
          ).toBeNull();
          expect(
            (await pool.query("SELECT status FROM occurrences WHERE id=1"))
              .rows[0].status,
          ).toBe("OPEN");
        } finally {
          await raced.close();
        }
      },
    );
    it("filtra WebSocket global e aplica revogação antes de novas mensagens", async () => {
      const broadcaster = new ReadingsBroadcaster(
        new PgMonitoringRepository(pool),
        { intervalMs: 15 },
      );
      const live = buildApp({
        database: pool,
        accessControlEnabled: true,
        jwtSecret: "scrum396-property-scope-acceptance-secret",
        readingsBroadcaster: broadcaster,
      });
      await live.ready();
      const socket = await live.injectWS("/api/stations/current/ws", {
        headers: headers(2),
      });
      const messages: { station_id: number }[] = [];
      socket.on("message", (data) => messages.push(JSON.parse(String(data))));
      try {
        await vi.waitFor(() => expect(broadcaster.isPolling).toBe(true));
        await new Promise((resolve) => setTimeout(resolve, 50));
        await pool.query(
          "INSERT INTO readings(id,sensor_id,value,unix_time) VALUES(3,1,12,extract(epoch FROM now())),(4,2,92,extract(epoch FROM now()))",
        );
        await vi.waitFor(() => expect(messages).toHaveLength(1));
        expect(messages[0]!.station_id).toBe(1);
        await pool.query("DELETE FROM user_properties WHERE user_id=2");
        await pool.query(
          "INSERT INTO readings(id,sensor_id,value,unix_time) VALUES(5,1,13,extract(epoch FROM now()))",
        );
        await new Promise((resolve) => setTimeout(resolve, 75));
        expect(messages).toHaveLength(1);
      } finally {
        socket.terminate();
        await live.close();
      }
    });
  },
);
