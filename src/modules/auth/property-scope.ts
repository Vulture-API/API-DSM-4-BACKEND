import { AsyncLocalStorage } from "node:async_hooks";

import type { AuthUser } from "@/modules/auth/types.js";

export type PropertyScope = number[] | null;
export const propertyScopeContext = new AsyncLocalStorage<{
  ids: PropertyScope;
}>();

/** null = global; [] = nenhum vínculo. Nunca derive privilégios de IDs fixos. */
export function resolveAccessibleProperties(user: AuthUser): PropertyScope {
  return user.role_name === "Administrador" ? null : (user.property_ids ?? []);
}

/** Usado somente em SQL interno, com a coluna escolhida pelo repositório. */
export function scopeCondition(column: string, values: unknown[]): string {
  const ids = propertyScopeContext.getStore()?.ids;
  if (ids === undefined || ids === null) return "TRUE";
  values.push(ids);
  return `${column} = ANY($${values.length}::int[])`;
}
