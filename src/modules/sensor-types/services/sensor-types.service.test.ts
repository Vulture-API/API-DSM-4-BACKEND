import { describe, expect, it } from "vitest";

import { SensorTypeConflictError } from "@/modules/sensor-types/errors/sensor-type-conflict.error.js";
import { SensorTypeNotFoundError } from "@/modules/sensor-types/errors/sensor-type-not-found.error.js";
import { InMemorySensorTypeRepository } from "@/modules/sensor-types/repositories/sensor-type.repository.js";

import { DeleteSensorTypeService } from "./delete-sensor-type.service.js";
import { UpdateSensorTypeService } from "./update-sensor-type.service.js";

describe("SensorType Services", () => {
  describe("DeleteSensorTypeService", () => {
    it("deve lançar SensorTypeNotFoundError se não encontrar registro", async () => {
      const repo = new InMemorySensorTypeRepository();
      const service = new DeleteSensorTypeService(repo);

      await expect(service.execute(999)).rejects.toThrow(
        SensorTypeNotFoundError,
      );
    });

    it("deve lançar SensorTypeConflictError se houver associação com sensores", async () => {
      const repo = new InMemorySensorTypeRepository();
      const created = await repo.create({
        name: "Umidade",
        unit_of_measure: "%",
      });
      const checkAssociation = async () => true;
      const service = new DeleteSensorTypeService(repo, checkAssociation);

      await expect(service.execute(created.id)).rejects.toThrow(
        SensorTypeConflictError,
      );
    });

    it("deve deletar com sucesso se existir e não houver associação", async () => {
      const repo = new InMemorySensorTypeRepository();
      const created = await repo.create({
        name: "Umidade",
        unit_of_measure: "%",
      });
      const checkAssociation = async () => false;
      const service = new DeleteSensorTypeService(repo, checkAssociation);

      await expect(service.execute(created.id)).resolves.toBeUndefined();
      expect(await repo.findById(created.id)).toBeNull();
    });
  });

  describe("UpdateSensorTypeService", () => {
    it("deve lançar SensorTypeNotFoundError se id não existir", async () => {
      const repo = new InMemorySensorTypeRepository();
      const service = new UpdateSensorTypeService(repo);

      await expect(
        service.execute(999, { name: "Temp", unit_of_measure: "C" }),
      ).rejects.toThrow(SensorTypeNotFoundError);
    });

    it("deve lançar SensorTypeConflictError se novo nome pertencer a outro id", async () => {
      const repo = new InMemorySensorTypeRepository();
      await repo.create({
        name: "Temperatura",
        unit_of_measure: "C",
      });
      const s2 = await repo.create({
        name: "Pressao",
        unit_of_measure: "hPa",
      });
      const service = new UpdateSensorTypeService(repo);

      await expect(
        service.execute(s2.id, {
          name: "Temperatura",
          unit_of_measure: "hPa",
        }),
      ).rejects.toThrow(SensorTypeConflictError);
    });

    it("deve lançar SensorTypeNotFoundError se repo.update falhar", async () => {
      const repo = new InMemorySensorTypeRepository();
      const created = await repo.create({
        name: "Chuva",
        unit_of_measure: "mm",
      });
      const service = new UpdateSensorTypeService(repo);
      repo.update = async () => null;

      await expect(
        service.execute(created.id, {
          name: "Chuva Nova",
          unit_of_measure: "mm",
        }),
      ).rejects.toThrow(SensorTypeNotFoundError);
    });
  });
});
