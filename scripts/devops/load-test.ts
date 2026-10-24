import { type ChildProcess, fork } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import WebSocket from "ws";

import { type Sample, summarize } from "./load-metrics.js";

type Server = {
  address: string;
  dataset: Record<string, unknown>;
  pid: number;
  poolMax: number;
  readOnly: boolean;
  child: ChildProcess;
};
type Endpoint = { route: string; key: string };
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const quick = process.argv.includes("--quick");
const frontendOnly = process.argv.includes("--frontend-only");
const limitSearch = process.argv.includes("--find-limit");
const extended = process.argv.includes("--extended") || limitSearch;
const thinkMs = extended ? 1000 : 2000;
const capacityRateLimit = limitSearch ? 1000000 : extended ? 100000 : 600;
const email = process.env.LOAD_EMAIL;
const password = process.env.LOAD_PASSWORD;
const frontendUrl = process.env.LOAD_FRONTEND_URL;
const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const output = path.join(
  root,
  "docs/devops/evidencias/scrum-472",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
const active = new Set<ChildProcess>();
const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());

async function startServer(max = capacityRateLimit): Promise<Server> {
  const child = fork(
    fileURLToPath(new URL("./load-test-server.ts", import.meta.url)),
    [],
    {
      execArgv: ["--import", "tsx"],
      env: {
        ...process.env,
        RULES_ENGINE_ENABLED: "false",
        OCCURRENCES_ENABLED: "false",
        LOAD_SERVER_RATE_MAX: String(max),
        LOAD_SERVER_POOL_MAX: extended ? "10" : "5",
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  active.add(child);
  child.stderr?.on("data", () => {
    /* Não persistir logs que possam conter configuração local. */
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Servidor de ensaio não iniciou em 30s."));
    }, 30000);
    child.once("message", (data) => {
      clearTimeout(timeout);
      if (data && typeof data === "object" && "error" in data) {
        reject(new Error(String(data.error)));
        return;
      }
      resolve({ ...(data as Omit<Server, "child">), child });
    });
    child.once("exit", () => {
      clearTimeout(timeout);
      active.delete(child);
      reject(new Error("Servidor de ensaio encerrado antes de ficar pronto."));
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
async function stopServer(server: Server) {
  if (server.child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => server.child.kill(), 12000);
    server.child.once("exit", () => {
      clearTimeout(timeout);
      active.delete(server.child);
      resolve();
    });
    server.child.send("stop");
  });
}
async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
  });
  if (!response.ok)
    throw new Error(
      `Pré-condição HTTP ${response.status} em ${new URL(url).pathname}.`,
    );
  return response.json();
}
async function login(base: string) {
  const data = (await json(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })) as { access_token: string };
  if (!data.access_token) throw new Error("Login sem token.");
  return { Authorization: `Bearer ${data.access_token}` };
}
async function request(
  base: string,
  endpoint: Endpoint,
  headers: Record<string, string>,
): Promise<Sample> {
  const start = performance.now();
  const sample: Sample = {
    route: endpoint.route,
    status: 0,
    durationMs: 0,
    bytes: 0,
    valid: false,
    startedAt: new Date().toISOString(),
  };
  try {
    const response = await fetch(base + endpoint.route, {
      headers,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    });
    sample.status = response.status;
    const text = await response.text();
    sample.bytes = Buffer.byteLength(text);
    if (response.status === 200) {
      const data = JSON.parse(text) as Record<string, unknown>;
      sample.valid =
        data !== null && typeof data === "object" && endpoint.key in data;
    }
  } catch {
    /* Status 0 representa erro de transporte/timeout; nunca conta como sucesso. */
  }
  sample.durationMs = performance.now() - start;
  return sample;
}
async function stage(
  base: string,
  endpoints: Endpoint[],
  headers: Record<string, string>,
  name: string,
  users: number,
  seconds: number,
  thinkMs = 1000,
  monitorResources = true,
  stopAtSlo = false,
) {
  console.log(
    `${name}: ${users} ${stopAtSlo ? "consultas concorrentes" : "usuários virtuais"}, ${seconds}s, pausa ${thinkMs}ms`,
  );
  const samples: Sample[] = [];
  const resources: unknown[] = [];
  const started = performance.now();
  const deadline = started + seconds * 1000;
  let done = false;
  let circuitBroken = false;
  let stopReason: string | null = null;
  let issued = 0;
  let errors = 0;
  const generatorCpuStart = process.cpuUsage();
  const monitor = (async () => {
    if (!monitorResources) return;
    while (!done && !controller.signal.aborted) {
      try {
        const resource = await json(`${base}/api/devops/resources`);
        resources.push(resource);
        if (
          stopAtSlo &&
          (resource?.resources?.memory?.rssMb > 512 ||
            resource?.resources?.eventLoop?.lagMs > 1000)
        ) {
          stopReason = "RESOURCE_GUARD";
          circuitBroken = true;
        }
      } catch {
        resources.push({
          error: "Falha ao consultar recursos",
          timestamp: new Date().toISOString(),
        });
      }
      await pause(2000);
    }
  })();
  await Promise.all(
    Array.from({ length: users }, async (_, user) => {
      let iteration = user;
      // Distribuir partidas para evitar rajada artificial no início de toda etapa.
      await pause(
        user *
          (thinkMs === 0
            ? Math.min(5, 200 / users)
            : Math.min(20, thinkMs / Math.max(users, 1))),
      );
      while (
        performance.now() < deadline &&
        !controller.signal.aborted &&
        !circuitBroken
      ) {
        if (stopAtSlo && issued >= 12000) {
          stopReason ??= "REQUEST_BUDGET";
          break;
        }
        issued++;
        const sample = await request(
          base,
          endpoints[iteration++ % endpoints.length]!,
          headers,
        );
        samples.push(sample);
        if (sample.status !== 200 || !sample.valid) errors++;
        if (
          stopAtSlo &&
          sample.status === 200 &&
          sample.valid &&
          sample.durationMs > 3000
        ) {
          stopReason = "RESPONSE_OVER_3S";
          circuitBroken = true;
        }
        if (
          samples.length >= 50 &&
          errors / samples.length > (stopAtSlo ? 0.01 : 0.1)
        ) {
          stopReason ??= "ERROR_RATE";
          circuitBroken = true;
        }
        if (thinkMs) await pause(thinkMs);
      }
    }),
  );
  const elapsedSeconds = (performance.now() - started) / 1000;
  done = true;
  await monitor;
  const summary = summarize(samples, elapsedSeconds);
  const cpu = process.cpuUsage(generatorCpuStart);
  const byRoute = Object.fromEntries(
    endpoints.map((e) => [
      e.route,
      summarize(
        samples.filter((s) => s.route === e.route),
        elapsedSeconds,
      ),
    ]),
  );
  const result = {
    name,
    users,
    plannedSeconds: seconds,
    elapsedSeconds,
    thinkMs,
    circuitBroken,
    stopReason,
    generator: {
      cpuPercentOfOneCore: (cpu.user + cpu.system) / (elapsedSeconds * 10000),
      rssMb: process.memoryUsage().rss / 1024 ** 2,
    },
    ...summary,
    byRoute,
    resourceSamples: resources,
  };
  fs.writeFileSync(
    path.join(output, `${name}-requests.jsonl`),
    samples.map((s) => JSON.stringify(s)).join("\n") + "\n",
  );
  fs.writeFileSync(
    path.join(output, `${name}.json`),
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      name,
      requests: summary.requests,
      p95: summary.latencyMs.p95,
      max: summary.latencyMs.max,
      errors: summary.errors,
      passed: summary.passed,
    }),
  );
  return result;
}

async function findCapacity(
  server: Server,
  endpoints: Endpoint[],
  headers: Record<string, string>,
) {
  const results: Awaited<ReturnType<typeof stage>>[] = [];
  const baseline = await stage(
    server.address,
    endpoints,
    headers,
    "limit-baseline",
    1,
    10,
    1000,
  );
  results.push(baseline);
  let stable = 0;
  let failed: number | null = null;
  let stop = "CONCURRENCY_CEILING";
  const checkpoint = () =>
    fs.writeFileSync(
      path.join(output, "limit-summary.json"),
      JSON.stringify(
        {
          task: "SCRUM-472",
          profile: "find-limit",
          completed: false,
          dataset: server.dataset,
          environment: {
            node: process.version,
            os: os.platform(),
            cpuCores: os.cpus().length,
            totalMemoryGb: os.totalmem() / 1024 ** 3,
            poolMax: server.poolMax,
            readOnly: server.readOnly,
            authEnabled: true,
            rateLimitPerMinute: capacityRateLimit,
            maxConcurrency: 1024,
            perStageRequestBudget: 12000,
          },
          criteria: { maximumResponseMs: 3000, maximumErrorPercent: 1 },
          baselinePassed: baseline.passed,
          highestStableConcurrency: stable,
          lowestFailingConcurrency: failed,
          stopReason: stop,
          results,
          note: "Concorrência de consultas sem pausa; não representa usuários humanos nem limite isolado do banco. Gerador e backend compartilham a máquina. Base pequena, somente leitura.",
        },
        null,
        2,
      ),
    );
  checkpoint();
  if (baseline.passed) {
    for (const concurrency of [5, 10, 20, 40, 80, 160, 320, 640, 1024]) {
      if (controller.signal.aborted) throw new Error("Execução interrompida.");
      const result = await stage(
        server.address,
        endpoints,
        headers,
        `limit-${concurrency}`,
        concurrency,
        15,
        0,
        true,
        true,
      );
      results.push(result);
      if (controller.signal.aborted) throw new Error("Execução interrompida.");
      if (
        result.stopReason === "RESOURCE_GUARD" ||
        result.stopReason === "REQUEST_BUDGET" ||
        result.rateLimited
      ) {
        stop = result.rateLimited ? "RATE_LIMIT_GUARD" : result.stopReason!;
        checkpoint();
        break;
      }
      if (!result.passed || result.circuitBroken) {
        failed = concurrency;
        stop = "SLO_VIOLATION";
        checkpoint();
        // Drenar/reduzir carga antes de confirmar e aproximar a faixa de corte.
        await pause(5000);
        if (controller.signal.aborted)
          throw new Error("Execução interrompida.");
        const confirmation = await stage(
          server.address,
          endpoints,
          headers,
          `limit-confirm-${concurrency}`,
          concurrency,
          10,
          0,
          true,
          true,
        );
        results.push(confirmation);
        if (controller.signal.aborted)
          throw new Error("Execução interrompida.");
        if (confirmation.passed && !confirmation.circuitBroken) {
          stop = "TRANSIENT_VIOLATION";
          checkpoint();
          break;
        }
        if (
          confirmation.stopReason === "RESOURCE_GUARD" ||
          confirmation.stopReason === "REQUEST_BUDGET" ||
          confirmation.rateLimited
        ) {
          stop = "CONFIRMATION_GUARD";
          checkpoint();
          break;
        }
        for (let step = 0; step < 3 && failed - stable > 1; step++) {
          await pause(3000);
          if (controller.signal.aborted)
            throw new Error("Execução interrompida.");
          const middle = Math.floor((stable + failed) / 2);
          const probe = await stage(
            server.address,
            endpoints,
            headers,
            `limit-refine-${middle}`,
            middle,
            10,
            0,
            true,
            true,
          );
          results.push(probe);
          if (controller.signal.aborted)
            throw new Error("Execução interrompida.");
          if (
            probe.stopReason === "RESOURCE_GUARD" ||
            probe.stopReason === "REQUEST_BUDGET" ||
            probe.rateLimited
          ) {
            stop = "REFINEMENT_GUARD";
            break;
          }
          if (probe.passed && !probe.circuitBroken) stable = middle;
          else failed = middle;
          checkpoint();
        }
        break;
      }
      stable = concurrency;
      checkpoint();
      await pause(1000);
    }
  } else stop = "BASELINE_FAILURE";
  await pause(5000);
  const recovery = await stage(
    server.address,
    endpoints,
    headers,
    "limit-recovery",
    1,
    15,
    1000,
  );
  results.push(recovery);
  if (controller.signal.aborted) throw new Error("Execução interrompida.");
  checkpoint();
  const report = JSON.parse(
    fs.readFileSync(path.join(output, "limit-summary.json"), "utf8"),
  );
  report.completed = true;
  report.recoveryPassed = recovery.passed;
  report.limitConfirmed = failed !== null && stop === "SLO_VIOLATION";
  report.generatedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(output, "limit-summary.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      highestStableConcurrency: stable,
      lowestFailingConcurrency: failed,
      stopReason: stop,
      recoveryPassed: recovery.passed,
      evidence: output,
    }),
  );
  if (!baseline.passed || !recovery.passed) process.exitCode = 1;
}

async function websocketStage(
  server: Server,
  headers: Record<string, string>,
  count: number,
  seconds: number,
) {
  const clients: WebSocket[] = [];
  const samples: Sample[] = [];
  let messages = 0;
  let unexpectedCloses = 0;
  let closing = false;
  try {
    await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        await pause(index * 20);
        const start = performance.now();
        const socket = new WebSocket(
          server.address.replace("http:", "ws:") + "/api/stations/current/ws",
          { headers, handshakeTimeout: 10000 },
        );
        clients.push(socket);
        socket.on("message", () => {
          messages++;
        });
        socket.on("close", () => {
          if (!closing) unexpectedCloses++;
        });
        socket.on("error", () => {});
        const opened = await new Promise<boolean>((resolve) => {
          socket.once("open", () => resolve(true));
          socket.once("error", () => resolve(false));
          socket.once("close", () => resolve(false));
        });
        samples.push({
          route: "/api/stations/current/ws",
          status: opened ? 200 : 0,
          valid: opened,
          durationMs: performance.now() - start,
          bytes: 0,
          startedAt: new Date().toISOString(),
        });
      }),
    );
    await pause(seconds * 1000);
    const result = {
      connections: count,
      holdSeconds: seconds,
      handshakes: summarize(samples, seconds),
      messages,
      unexpectedCloses,
      passed: samples.every((s) => s.valid) && unexpectedCloses === 0,
      deliveryValidated: false,
    };
    fs.writeFileSync(
      path.join(output, `websocket-${count}.json`),
      JSON.stringify(result, null, 2),
    );
    console.log(
      JSON.stringify({
        websocketConnections: count,
        ...result.handshakes.latencyMs,
        passed: result.passed,
      }),
    );
    return result;
  } finally {
    closing = true;
    for (const socket of clients) socket.close();
    await pause(300);
    for (const socket of clients)
      if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
  }
}

async function main() {
  if (!email || !password)
    throw new Error(
      "Defina LOAD_EMAIL e LOAD_PASSWORD no ambiente; nunca os coloque nos arquivos de evidência.",
    );
  if (frontendOnly && !frontendUrl)
    throw new Error("--frontend-only exige LOAD_FRONTEND_URL.");
  if (limitSearch && (frontendOnly || quick))
    throw new Error("Use --find-limit separado de --quick e --frontend-only.");
  fs.mkdirSync(output, { recursive: true });
  const server = await startServer();
  try {
    const headers = await login(server.address);
    const overview = (await json(`${server.address}/api/stations/overview`, {
      headers,
    })) as { stations: { id: number }[] };
    const id = overview.stations[0]?.id;
    if (!id) throw new Error("É necessário pelo menos uma estação no banco.");
    const now = Math.floor(Date.now() / 1000);
    const endpoints: Endpoint[] = [
      { route: "/api/stations/overview", key: "stations" },
      { route: "/api/stations/current", key: "stations" },
      { route: `/api/stations/${id}/current`, key: "stations" },
      {
        route: "/api/stations/readings/series?hours=720&bucket_minutes=120",
        key: "series",
      },
      {
        route: `/api/readings?station_id=${id}&limit=100&start_unix_time=${now - 30 * 86400}&end_unix_time=${now}`,
        key: "data",
      },
      { route: "/api/stations/statistics", key: "sensor_types" },
    ];
    for (const endpoint of endpoints) {
      const preflight = await request(server.address, endpoint, headers);
      if (!preflight.valid)
        throw new Error(
          `Pré-condição inválida: ${endpoint.route} HTTP ${preflight.status}.`,
        );
    }
    if (limitSearch) {
      await findCapacity(server, endpoints, headers);
      return;
    }
    const results = [];
    if (!frontendOnly)
      for (const [name, users, seconds] of [
        ["baseline", 1, quick ? 5 : extended ? 30 : 15],
        ["normal", extended ? 5 : 3, quick ? 5 : extended ? 60 : 30],
        ["peak", extended ? 10 : 5, quick ? 5 : extended ? 60 : 30],
        ["stress", extended ? 20 : 10, quick ? 5 : extended ? 60 : 30],
        ["endurance", extended ? 5 : 3, quick ? 5 : extended ? 120 : 60],
        ["recovery", 1, quick ? 5 : extended ? 30 : 15],
      ] as const) {
        if (controller.signal.aborted)
          throw new Error("Execução interrompida.");
        const result = await stage(
          server.address,
          endpoints,
          headers,
          name,
          users,
          seconds,
          thinkMs,
        );
        results.push(result);
        if (result.circuitBroken) break;
      }
    const websocket = [];
    if (!frontendOnly)
      for (const count of extended ? [10, 30] : [5, 10])
        websocket.push(
          await websocketStage(
            server,
            headers,
            count,
            quick ? 2 : extended ? 20 : 10,
          ),
        );
    const report: Record<string, unknown> = {
      task: "SCRUM-472",
      generatedAt: new Date().toISOString(),
      quick,
      profile: frontendOnly
        ? "frontend-only"
        : extended
          ? "extended"
          : "free-tier",
      environment: {
        node: process.version,
        os: os.platform(),
        cpuCores: os.cpus().length,
        totalMemoryGb: os.totalmem() / 1024 ** 3,
        backendPid: server.pid,
        poolMax: server.poolMax,
        readOnly: server.readOnly,
        authEnabled: true,
        capacityRateLimitPerMinute: capacityRateLimit,
        configuredRateLimitProbe: extended && !frontendOnly ? 300 : null,
        transport: "TCP loopback, processo separado",
      },
      dataset: server.dataset,
      criteria: {
        maximumSuccessfulResponseMs: 3000,
        minimumSuccessfulResponsesPercent: 99,
        note: "3s vem do RNF01. Sucesso HTTP >=99% é critério do ensaio e não comprova SLA temporal RNF02. Volumes são hipóteses de teste, não demanda homologada.",
      },
      sources: [
        "https://vultureapi.atlassian.net/browse/SCRUM-472",
        "https://vultureapi.atlassian.net/wiki/spaces/V/pages/3866626",
        "https://vultureapi.atlassian.net/wiki/spaces/V/pages/35717121",
        "https://vultureapi.atlassian.net/wiki/spaces/V/pages/37453825",
      ],
      results,
      websocket,
      rateLimit: {
        executed: false,
        note: "Teste de rajada opcional: execute com --extended.",
      },
      limitations: [
        "Banco compartilhado somente leitura: não houve expansão de estações/leituras ou ingestão MQTT. RNF03 e processamento ponta a ponta não estão integralmente homologados.",
        "Gerador e backend em processos separados na mesma máquina; banco e rede externos afetam o resultado.",
        "WebSocket valida estabelecimento/manutenção, não latência de entrega de novas medições.",
        "Rate limit aumentado somente no servidor efêmero para separar capacidade de política de proteção.",
        "Sem previsão externa no mix para não medir nem sobrecarregar Open-Meteo.",
      ],
    };
    await stopServer(server);
    if (!frontendOnly && extended) {
      const limited = await startServer(300);
      try {
        const limitedHeaders = await login(limited.address);
        const samples: Sample[] = [];
        const rateStarted = performance.now();
        await Promise.all(
          Array.from({ length: 10 }, async () => {
            for (let i = 0; i < 31; i++)
              samples.push(
                await request(
                  limited.address,
                  { route: "/api/auth/me", key: "permissions" },
                  limitedHeaders,
                ),
              );
          }),
        );
        report.rateLimit = {
          executed: true,
          ...summarize(samples, (performance.now() - rateStarted) / 1000),
          passed:
            samples.some((s) => s.status === 429) &&
            samples.some((s) => s.valid) &&
            samples.every((s) => s.status === 200 || s.status === 429),
          note: "310 consultas em servidor novo com limite 300/min/IP; 429 é esperado aqui. Vazão não interpretada, fase de proteção.",
        };
        fs.writeFileSync(
          path.join(output, "rate-limit-requests.jsonl"),
          samples.map((s) => JSON.stringify(s)).join("\n"),
        );
      } finally {
        await stopServer(limited);
      }
    }
    // Preservar resultados completos do backend mesmo se o frontend estiver indisponível.
    fs.writeFileSync(
      path.join(output, "summary.json"),
      JSON.stringify({ ...report, completed: false }, null, 2),
    );
    if (frontendUrl) {
      const url = new URL(frontendUrl);
      if (!["localhost", "127.0.0.1"].includes(url.hostname))
        throw new Error("LOAD_FRONTEND_URL deve ser local.");
      const response = await fetch(`${url.origin}/api/auth/login`, {
        method: "POST",
        headers: { Origin: url.origin, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw new Error(`Login do frontend HTTP ${response.status}.`);
      const cookie = response.headers
        .getSetCookie()
        .map((s) => s.split(";")[0])
        .join("; ");
      try {
        report.frontend = await stage(
          url.origin,
          endpoints.map((e) => ({
            ...e,
            route: e.route.replace("/api/", "/api/backend/"),
          })),
          { Cookie: cookie },
          "frontend-proxy",
          1,
          quick ? 5 : extended ? 30 : 15,
          thinkMs,
          false,
        );
      } finally {
        await fetch(`${url.origin}/api/auth/logout`, {
          method: "POST",
          headers: { Cookie: cookie, Origin: url.origin },
          signal: AbortSignal.timeout(10000),
        });
      }
    }
    report.passed =
      (frontendOnly || results.length === 6) &&
      results.every((r) => r.passed) &&
      websocket.every((w) => w.passed) &&
      (frontendOnly ||
        !extended ||
        (report.rateLimit as { passed: boolean }).passed) &&
      (!report.frontend || (report.frontend as { passed: boolean }).passed);
    report.completed = true;
    fs.writeFileSync(
      path.join(output, "summary.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(`Evidências: ${output}`);
    console.log(
      `Critérios do ensaio: ${report.passed ? "APROVADOS" : "REPROVADOS"}. Consulte as limitações antes de concluir sobre os RNFs.`,
    );
    if (!report.passed) process.exitCode = 1;
  } finally {
    await stopServer(server);
  }
}
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Falha no ensaio.");
    if (fs.existsSync(output))
      fs.writeFileSync(
        path.join(output, "execution-error.json"),
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            aborted: controller.signal.aborted,
            message:
              error instanceof Error ? error.message : "Falha no ensaio.",
          },
          null,
          2,
        ),
      );
    process.exitCode = 1;
  })
  .finally(() => {
    for (const child of active) child.kill();
  });
