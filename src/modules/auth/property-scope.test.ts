import { describe, expect, it } from "vitest";

import {
  propertyScopeContext,
  resolveAccessibleProperties,
  scopeCondition,
} from "@/modules/auth/property-scope.js";
import type { AuthUser } from "@/modules/auth/types.js";

describe("SCRUM-609: resolução de escopo", () => {
  it("usa o perfil atual e não IDs fixos", () => {
    expect(
      resolveAccessibleProperties({
        role_name: "Administrador",
        role_id: 99,
      } as AuthUser),
    ).toBeNull();
    expect(
      resolveAccessibleProperties({
        role_name: "Cliente",
        property_ids: [2],
      } as AuthUser),
    ).toEqual([2]);
    expect(
      resolveAccessibleProperties({
        role_name: "Gerente Agrícola",
        property_ids: [],
      } as unknown as AuthUser),
    ).toEqual([]);
    expect(
      resolveAccessibleProperties({ role_name: "Personalizado" } as AuthUser),
    ).toEqual([]);
  });
  it("isola requisições concorrentes e parametriza a lista vazia", async () => {
    const actual = await Promise.all(
      [[1], [], null].map((ids) =>
        propertyScopeContext.run({ ids }, async () => {
          await Promise.resolve();
          const values: unknown[] = [42];
          return [scopeCondition("st.property_id", values), values];
        }),
      ),
    );
    expect(actual).toEqual([
      ["st.property_id = ANY($2::int[])", [42, [1]]],
      ["st.property_id = ANY($2::int[])", [42, []]],
      ["TRUE", [42]],
    ]);
  });
});
