import { describe, expect, it } from "vitest";

import { SensorConflictError } from "@/modules/sensors/errors/sensor-conflict.error.js";
import { SensorNotFoundError } from "@/modules/sensors/errors/sensor-not-found.error.js";
import { SensorRepository } from "@/modules/sensors/repositories/sensor.repository.js";

import { DeleteSensorService } from "./delete-sensor.service.js";
import { UpdateSensorService } from "./update-sensor.service.js";

describe("Sensor Services", () => {
  describe("DeleteSensorService", () => {
    it("deve lançar SensorNotFoundError se sensor não existir", async () => {
      const repo = new SensorRepository();
      const service = new DeleteSensorService(repo);

      await expect(service.execute(999)).rejects.toThrow(SensorNotFoundError);
    });

    it("deve deletar com sucesso quando existir", async () => {
      const repo = new SensorRepository();
      const created = await repo.create({
        station_id: 1,
        sensor_type_id: 1,
        local_identifier: "SENS_01",
        operational_status: true,
      });
      const service = new DeleteSensorService(repo);

      await expect(service.execute(created.id)).resolves.toBeUndefined();
      expect(await repo.findById(created.id)).toBeNull();
    });
  });

  describe("UpdateSensorService", () => {
    it("deve lançar SensorNotFoundError se sensor não existir", async () => {
      const repo = new SensorRepository();
      const service = new UpdateSensorService(repo);

      await expect(
        service.execute(999, {
          station_id: 1,
          sensor_type_id: 1,
          local_identifier: "SENS_01",
          operational_status: true,
        }),
      ).rejects.toThrow(SensorNotFoundError);
    });

    it("deve lançar SensorConflictError se tentar usar mesmo identificador de outro sensor na mesma estação", async () => {
      const repo = new SensorRepository();
      await repo.create({
        station_id: 1,
        sensor_type_id: 1,
        local_identifier: "SENS_A",
        operational_status: true,
      });
      const s2 = await repo.create({
        station_id: 1,
        sensor_type_id: 1,
        local_identifier: "SENS_B",
        operational_status: true,
      });
      const service = new UpdateSensorService(repo);

      await expect(
        service.execute(s2.id, {
          station_id: 1,
          sensor_type_id: 1,
          local_identifier: "SENS_A",
          operational_status: true,
        }),
      ).rejects.toThrow(SensorConflictError);
    });

    it("deve lançar SensorNotFoundError se repo.update falhar", async () => {
      const repo = new SensorRepository();
      const created = await repo.create({
        station_id: 1,
        sensor_type_id: 1,
        local_identifier: "SENS_01",
        operational_status: true,
      });
      const service = new UpdateSensorService(repo);
      repo.update = async () => null;

      await expect(
        service.execute(created.id, {
          station_id: 1,
          sensor_type_id: 1,
          local_identifier: "SENS_NEW",
          operational_status: true,
        }),
      ).rejects.toThrow(SensorNotFoundError);
    });
  });
});
