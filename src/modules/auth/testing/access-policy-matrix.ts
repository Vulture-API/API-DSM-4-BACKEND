import type { AccessPolicy } from "@/modules/auth/access-control.js";

/** Acceptance contract, independent of the policies read from registered routes. */
export function expectedAccessPolicies() {
  const policies = new Map<string, AccessPolicy>();
  const add = (method: string, path: string, policy: AccessPolicy) => {
    policies.set(`${method} ${path}`, policy);
    if (method === "GET") policies.set(`HEAD ${path}`, policy);
  };
  const crud = (
    path: string,
    resource:
      | "users"
      | "roles"
      | "stations"
      | "sensors"
      | "sensor-types"
      | "alert-configs",
  ) => {
    add("GET", path, { permission: `${resource}.read` });
    add("GET", `${path}/:id`, { permission: `${resource}.read` });
    add("POST", path, { permission: `${resource}.create` });
    add("PUT", `${path}/:id`, { permission: `${resource}.update` });
    add("DELETE", `${path}/:id`, { permission: `${resource}.delete` });
  };

  for (const path of [
    "/",
    "/health",
    "/api/health",
    "/api/v1/health",
    "/metrics",
    "/health/detailed",
    "/api/devops/metrics",
    "/api/devops/resources",
    "/api/devops/ping",
  ])
    add("GET", path, { public: true });
  add("POST", "/api/auth/login", { public: true });
  add("GET", "/api/auth/me", { always: true });
  crud("/api/users", "users");
  crud("/api/roles", "roles");
  crud("/api/stations", "stations");
  crud("/api/alerts/config", "alert-configs");
  add("PATCH", "/api/users/:id/access", {
    always: true,
    permission: "users.update",
  });
  add("GET", "/api/permissions", {
    always: true,
    permission: "permissions.read",
  });
  add("GET", "/api/roles/:id/permissions", {
    always: true,
    permission: "roles.read",
  });
  add("PUT", "/api/roles/:id/permissions", {
    always: true,
    permission: "roles.permissions.update",
  });

  for (const prefix of ["", "/v1", "/api", "/api/v1"]) {
    for (const resource of ["sensors", "sensor-types"] as const) {
      const path = `${prefix}/${resource}`;
      crud(path, resource);
      add("OPTIONS", path, { public: true });
      add("OPTIONS", `${path}/*`, { public: true });
    }
  }
  for (const prefix of ["", "/api"]) {
    const path = `${prefix}/properties`;
    add("GET", path, { permission: "properties.read" });
    add("POST", path, { permission: "properties.create" });
    add("PUT", `${path}/:id`, { permission: "properties.update" });
    add("DELETE", `${path}/:id`, { permission: "properties.delete" });
    add("OPTIONS", path, { public: true });
    add("OPTIONS", `${path}/*`, { public: true });
  }
  add("GET", "/api/stations/properties", { permission: "properties.read" });
  add("GET", "/api/stations/:id/status", { permission: "stations.read" });
  for (const path of [
    "/api/stations/overview",
    "/api/stations/current",
    "/api/stations/:id/current",
    "/api/stations/readings/series",
    "/api/stations/:id/readings/series",
    "/api/stations/statistics",
    "/api/stations/:id/statistics",
    "/api/stations/:id/forecast",
    "/api/readings",
    "/readings",
    "/api/v1/readings",
  ])
    add("GET", path, { permission: "monitoring.read" });
  add("GET", "/api/stations/current/ws", {
    permission: "monitoring.read",
    websocket: true,
  });
  add("GET", "/api/alerts/triggered", { permission: "triggered-alerts.read" });
  add("PUT", "/api/alerts/triggered/:id/acknowledge", {
    permission: "triggered-alerts.acknowledge",
  });
  for (const path of ["/api/occurrences", "/api/occurrences/:id"])
    add("GET", path, { permission: "occurrences.read" });
  add("PATCH", "/api/occurrences/:id/resolve", {
    permission: "occurrences.resolve",
  });
  add("POST", "/internal/occurrences/run", { permission: "occurrences.run" });
  add("POST", "/internal/rules-engine/run", { permission: "rules-engine.run" });
  return policies;
}
