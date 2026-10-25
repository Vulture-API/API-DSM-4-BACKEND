// Processo separado do gerador: HTTP real, repositórios SQL reais e pool read-only.
import { Pool } from "pg";

import { buildApp } from "../../src/app.js";
import { env } from "../../src/config/environment.js";
import { InMemorySystemOutageRepository } from "../../src/modules/devops/system-outage.repository.js";
import { createLogger } from "../../src/modules/logging/logger.js";

const standalone = process.env.LOAD_SERVER_STANDALONE === "true";
const poolMax = Number(process.env.LOAD_SERVER_POOL_MAX ?? 5);
if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 10)
  throw new Error("LOAD_SERVER_POOL_MAX deve ser de 1 a 10.");
if (!process.send && !standalone)
  throw new Error("Execute este servidor por npm run test:load.");
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: poolMax,
  connectionTimeoutMillis: 10_000,
  options: "-c default_transaction_read_only=on",
  application_name: "scrum-472-load-readonly",
});
pool.on("connect", (client) => {
  // Neon pooled não aceita statement_timeout no pacote de startup.
  // A consulta entra na fila antes da primeira consulta de negócio do cliente.
  void client.query("SET statement_timeout = '10s'").catch(() => {
    console.error("Falha ao configurar timeout da conexão de ensaio.");
  });
});
pool.on("error", () =>
  console.error("Conexão ociosa do ensaio foi encerrada."),
);
const app = buildApp({
  database: pool,
  accessControlEnabled: true,
  rateLimits: {
    max: Number(process.env.LOAD_SERVER_RATE_MAX ?? 600),
    timeWindowMs: 60000,
  },
  // Observabilidade não grava indisponibilidades no banco compartilhado.
  outageRepository: new InMemorySystemOutageRepository(),
  logger: createLogger({ level: "error", component: "load-test" }),
});

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await app.close();
  await pool.end();
  process.disconnect?.();
}
process.on("message", (message) => {
  if (message === "stop") void close();
});
process.on("SIGTERM", () => {
  void close();
});
process.on("SIGINT", () => {
  void close();
});

try {
  const guard = await pool.query("SHOW default_transaction_read_only");
  if (guard.rows[0]?.default_transaction_read_only !== "on")
    throw new Error("Pool não está read-only.");
  const data = await pool.query(`SELECT
    (SELECT count(*)::int FROM stations) AS stations,
    (SELECT count(*)::int FROM sensors) AS sensors,
    (SELECT count(*)::bigint FROM readings)::text AS readings,
    (SELECT max(unix_time) FROM readings)::text AS latest_reading_unix`);
  const address = await app.listen({
    host: "127.0.0.1",
    port: Number(process.env.LOAD_SERVER_PORT ?? 0),
  });
  process.send?.({
    address,
    dataset: data.rows[0],
    pid: process.pid,
    poolMax,
    readOnly: true,
  });
  if (standalone) console.log(`Servidor read-only de ensaio: ${address}`);
} catch (error) {
  const reason = (error instanceof Error ? error.message : "Erro desconhecido")
    .replaceAll(env.DATABASE_URL, "[DATABASE_URL]")
    .replaceAll(env.JWT_SECRET ?? "[NO_SECRET]", "[JWT_SECRET]");
  process.send?.({ error: reason });
  console.error(
    "Não foi possível iniciar o servidor de carga: confira JWT_SECRET, conexão e permissões do banco.",
  );
  await close();
  process.exitCode = 1;
}
