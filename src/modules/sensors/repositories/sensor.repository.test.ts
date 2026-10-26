import { describe, expect, it } from "vitest";

import { SensorRepository } from "./sensor.repository.js";

describe("SensorRepository", () => {
  it("deve cobrir paginação padrão, filtros e contagem por sensor type", async () => {
    const repo = new SensorRepository();

    // findPaginated sem parâmetros
    const emptyResult = await repo.findPaginated();
    expect(emptyResult.data).toHaveLength(0);
    expect(emptyResult.meta.total_records).toBe(0);

    // cria sensores
    const sensor1 = await repo.create({
      station_id: 1,
      sensor_type_id: 10,
      local_identifier: "TMP_01",
      operational_status: true,
    });
    const sensor2 = await repo.create({
      station_id: 2,
      sensor_type_id: 10,
      local_identifier: "TMP_02",
      operational_status: false,
    });
    await repo.create({
      station_id: 1,
      sensor_type_id: 20,
      local_identifier: "HUM_01",
      operational_status: true,
    });

    // countBySensorTypeId
    const countType10 = await repo.countBySensorTypeId(10);
    expect(countType10).toBe(2);
    const countType99 = await repo.countBySensorTypeId(99);
    expect(countType99).toBe(0);

    // findPaginated com filtro de station_id
    const station1Sensors = await repo.findPaginated({ station_id: 1 });
    expect(station1Sensors.data).toHaveLength(2);

    // findByStationAndIdentifier
    const foundByIdent = await repo.findByStationAndIdentifier(1, "TMP_01");
    expect(foundByIdent?.id).toBe(sensor1.id);
    const notFoundIdent = await repo.findByStationAndIdentifier(1, "UNKNOWN");
    expect(notFoundIdent).toBeNull();

    // findById
    const found = await repo.findById(sensor2.id);
    expect(found?.local_identifier).toBe("TMP_02");
    const notFound = await repo.findById(999);
    expect(notFound).toBeNull();

    // update inexistente
    const updateNull = await repo.update(999, { local_identifier: "NOPE" });
    expect(updateNull).toBeNull();

    // update existente com campos parciais
    const updated = await repo.update(sensor1.id, {
      operational_status: false,
    });
    expect(updated?.operational_status).toBe(false);
    expect(updated?.local_identifier).toBe("TMP_01");

    // delete existente e inexistente
    const deletedOk = await repo.delete(sensor1.id);
    expect(deletedOk).toBe(true);
    const deleteNotFound = await repo.delete(999);
    expect(deleteNotFound).toBe(false);
  });
});
