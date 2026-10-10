export const PERMISSIONS = [
  {
    code: "alert-configs.create",
    description: "Criar configurações de alerta",
  },
  {
    code: "alert-configs.delete",
    description: "Excluir configurações de alerta",
  },
  {
    code: "alert-configs.read",
    description: "Consultar configurações de alerta",
  },
  {
    code: "alert-configs.update",
    description: "Editar configurações de alerta",
  },
  {
    code: "monitoring.read",
    description: "Consultar monitoramento e leituras",
  },
  {
    code: "permissions.read",
    description: "Consultar catálogo de permissões",
  },
  {
    code: "properties.read",
    description: "Consultar propriedades",
  },
  {
    code: "roles.create",
    description: "Criar perfis",
  },
  {
    code: "roles.delete",
    description: "Excluir perfis",
  },
  {
    code: "roles.permissions.update",
    description: "Configurar permissões dos perfis",
  },
  {
    code: "roles.read",
    description: "Consultar perfis",
  },
  {
    code: "roles.update",
    description: "Editar perfis",
  },
  {
    code: "rules-engine.run",
    description: "Executar manualmente o motor de regras",
  },
  {
    code: "sensor-types.create",
    description: "Criar tipos de sensor",
  },
  {
    code: "sensor-types.delete",
    description: "Excluir tipos de sensor",
  },
  {
    code: "sensor-types.read",
    description: "Consultar tipos de sensor",
  },
  {
    code: "sensor-types.update",
    description: "Editar tipos de sensor",
  },
  {
    code: "sensors.create",
    description: "Criar sensores",
  },
  {
    code: "sensors.delete",
    description: "Excluir sensores",
  },
  {
    code: "sensors.read",
    description: "Consultar sensores",
  },
  {
    code: "sensors.update",
    description: "Editar sensores",
  },
  {
    code: "stations.create",
    description: "Criar estações",
  },
  {
    code: "stations.delete",
    description: "Excluir estações",
  },
  {
    code: "stations.read",
    description: "Consultar estações",
  },
  {
    code: "stations.update",
    description: "Editar estações",
  },
  {
    code: "triggered-alerts.acknowledge",
    description: "Reconhecer alertas",
  },
  {
    code: "triggered-alerts.read",
    description: "Consultar alertas disparados",
  },
  {
    code: "users.create",
    description: "Criar usuários",
  },
  {
    code: "users.delete",
    description: "Excluir usuários",
  },
  {
    code: "users.read",
    description: "Consultar usuários",
  },
  {
    code: "users.update",
    description: "Editar usuários",
  },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]["code"];
export const PERMISSION_CODES = PERMISSIONS.map(
  (permission) => permission.code,
);
