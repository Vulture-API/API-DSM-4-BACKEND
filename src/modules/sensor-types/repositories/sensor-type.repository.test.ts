import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  InMemorySensorTypeRepository,
  PgSensorTypeRepository,
} from "./sensor-type.repository.js";

describe("InMemorySensorTypeRepository", () => {
  it("deve lidar com update e delete quando registro não existe", async () => {
    const repo = new InMemorySensorTypeRepository();

    const updated = await repo.update(999, { name: "Non-existent" });
    expect(updated).toBeNull();

    const deleted = await repo.delete(999);
    expect(deleted).toBe(false);
  });

  it("deve criar, buscar e atualizar mantendo campos existentes", async () => {
    const repo = new InMemorySensorTypeRepository();
    const created = await repo.create({
      name: "Temp",
      unit_of_measure: "C",
      factor: 1,
      gain: 2,
    });

    const updated = await repo.update(created.id, {
      name: "Temperature",
    });

    expect(updated?.name).toBe("Temperature");
    expect(updated?.unit_of_measure).toBe("C");
    expect(updated?.factor).toBe(1);
    expect(updated?.gain).toBe(2);
  });
});

describe("PgSensorTypeRepository", () => {
  it("deve inicializar e executar queries com pool mockado", async () => {
    const mockQuery = vi.fn();
    const mockPool = { query: mockQuery } as unknown as Pool;
    const repo = new PgSensorTypeRepository(mockPool);

    // create
    mockQuery.mockResolvedValueOnce({ rows: [] }); // ensureTable
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          name: "Pressão",
          unit_of_measure: "hPa",
          factor: 1.0,
          gain: null,
        },
      ],
    });
    const created = await repo.create({
      name: "Pressão",
      unit_of_measure: "hPa",
    });
    expect(created.id).toBe(1);

    // findAll
    mockQuery.mockResolvedValueOnce({
      rows: [created],
    });
    const all = await repo.findAll();
    expect(all).toHaveLength(1);

    // findById - achou
    mockQuery.mockResolvedValueOnce({
      rows: [created],
    });
    const found = await repo.findById(1);
    expect(found?.name).toBe("Pressão");

    // findById - não achou
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });
    const notFound = await repo.findById(999);
    expect(notFound).toBeNull();

    // findByName - achou
    mockQuery.mockResolvedValueOnce({
      rows: [created],
    });
    const foundByName = await repo.findByName("Pressão");
    expect(foundByName?.id).toBe(1);

    // findByName - não achou
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });
    const notFoundByName = await repo.findByName("Desconhecido");
    expect(notFoundByName).toBeNull();

    // update - registro não encontrado
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });
    const updateNotFound = await repo.update(999, { name: "Novo" });
    expect(updateNotFound).toBeNull();

    // update - sucesso
    mockQuery.mockResolvedValueOnce({
      rows: [created], // findById existing
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...created, name: "Pressão Atmosférica" }], // update query
    });
    const updated = await repo.update(1, { name: "Pressão Atmosférica" });
    expect(updated?.name).toBe("Pressão Atmosférica");

    // update - falha de retorno
    mockQuery.mockResolvedValueOnce({
      rows: [created],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });
    const updateEmpty = await repo.update(1, {});
    expect(updateEmpty).toBeNull();

    // delete - sucesso
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
    });
    const deleted = await repo.delete(1);
    expect(deleted).toBe(true);

    // delete - não encontrou
    mockQuery.mockResolvedValueOnce({
      rowCount: 0,
    });
    const deleteNotFound = await repo.delete(999);
    expect(deleteNotFound).toBe(false);
  });

  it("deve tratar erro silencioso em ensureTable", async () => {
    const mockQuery = vi.fn().mockRejectedValueOnce(new Error("DB error"));
    const mockPool = { query: mockQuery } as unknown as Pool;
    const repo = new PgSensorTypeRepository(mockPool);

    mockQuery.mockResolvedValueOnce({ rows: [] }); // subsequente em findAll
    const res = await repo.findAll();
    expect(res).toEqual([]);
  });
});
