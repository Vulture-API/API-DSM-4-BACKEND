import { describe, expect, it } from "vitest";

import {
  propertyScopeContext,
  resolveAccessibleProperties,
  scopeCondition,
  scopedQuery,
} from "@/modules/auth/property-scope.js";
import type { AuthUser } from "@/modules/auth/types.js";

describe("SCRUM-610: parâmetros das consultas por propriedade", () => {
  it("preserva o comportamento legado fora do contexto de uma requisição", () => {
    const parameters: unknown[] = [12];
    expect(scopeCondition("st.property_id", parameters)).toBe("TRUE");
    expect(parameters).toEqual([12]);
  });

  it("não acrescenta filtros nem parâmetros ao escopo global", () => {
    propertyScopeContext.run({ ids: null }, () => {
      const parameters: unknown[] = [12];
      expect(scopeCondition("st.property_id", parameters)).toBe("TRUE");
      expect(parameters).toEqual([12]);
    });
  });

  it.each([[2, 7], []])(
    "mantém os vínculos %j parametrizados antes da agregação e paginação",
    (...ids) => {
      propertyScopeContext.run({ ids }, () => {
        const original: unknown[] = ["ativo", 20, 40];
        const [sql, parameters] = scopedQuery(
          "SELECT property_id, count(*) FROM stations WHERE status=$1 AND /* scope */ GROUP BY property_id LIMIT $2 OFFSET $3",
          original,
          "property_id",
        );
        expect(sql).toBe(
          "SELECT property_id, count(*) FROM stations WHERE status=$1 AND property_id = ANY($4::int[]) GROUP BY property_id LIMIT $2 OFFSET $3",
        );
        expect(parameters).toEqual(["ativo", 20, 40, ids]);
        expect(original).toEqual(["ativo", 20, 40]);
        expect(parameters).not.toBe(original);
      });
    },
  );

  it("clona os parâmetros mesmo quando a consulta é global", () => {
    const original: unknown[] = [42];
    const [sql, parameters] = scopedQuery(
      "SELECT id FROM properties WHERE id=$1 AND /* scope */",
      original,
      "id",
    );
    expect(sql).toBe("SELECT id FROM properties WHERE id=$1 AND TRUE");
    parameters.push("outro parâmetro");
    expect(original).toEqual([42]);
  });

  it("rejeita consultas sem o ponto explícito de filtragem", () => {
    propertyScopeContext.run({ ids: [2] }, () => {
      expect(() => scopedQuery("SELECT * FROM properties", [], "id")).toThrow();
    });
  });

  it("restaura o contexto externo após uma falha em um contexto interno", () => {
    propertyScopeContext.run({ ids: [2] }, () => {
      expect(() =>
        propertyScopeContext.run({ ids: [7] }, () => {
          throw new Error("falha da consulta");
        }),
      ).toThrow("falha da consulta");
      const parameters: unknown[] = [];
      expect(scopeCondition("id", parameters)).toBe("id = ANY($1::int[])");
      expect(parameters).toEqual([[2]]);
    });
    expect(propertyScopeContext.getStore()).toBeUndefined();
  });

  it("não reutiliza vínculos de uma requisição depois de ela terminar", async () => {
    const first = await propertyScopeContext.run({ ids: [2] }, async () => {
      await Promise.resolve();
      return scopedQuery("WHERE /* scope */", [], "property_id");
    });
    const second = await propertyScopeContext.run({ ids: [] }, async () => {
      await Promise.resolve();
      return scopedQuery("WHERE /* scope */", [], "property_id");
    });
    expect(first).toEqual(["WHERE property_id = ANY($1::int[])", [[2]]]);
    expect(second).toEqual(["WHERE property_id = ANY($1::int[])", [[]]]);
    expect(propertyScopeContext.getStore()).toBeUndefined();
  });

  it("usa o nome atual do perfil e mantém perfis personalizados restritos", () => {
    const restricted = {
      role_id: 1,
      role_name: "Operador",
      property_ids: [7],
    } as AuthUser;
    expect(resolveAccessibleProperties(restricted)).toEqual([7]);
    expect(
      resolveAccessibleProperties({
        ...restricted,
        role_id: 999,
        role_name: "Administrador",
      }),
    ).toBeNull();
    const withoutLinks = { ...restricted, role_name: "Cliente" };
    delete withoutLinks.property_ids;
    expect(resolveAccessibleProperties(withoutLinks)).toEqual([]);
  });
});
