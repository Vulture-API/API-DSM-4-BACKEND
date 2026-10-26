import { describe, expect, it } from "vitest";

import { SensorReferenceNotFoundError } from "@/modules/sensors/errors/sensor-reference-not-found.error.js";
import { InMemorySensorRepository } from "@/modules/sensors/repositories/sensor.repository.js";

import { CreateSensorService } from "./create-sensor.service.js";
import { UpdateSensorService } from "./update-sensor.service.js";

// US02 CA5: não permitir sensor sem associação a uma estação existente.
describe("Validação de estação e tipo de sensor", () => {
  const repository = () =>
    new InMemorySensorRepository(new Set([1, 2]), new Set([10]));

  const input = (station_id: number, sensor_type_id = 10) => ({
    station_id,
    sensor_type_id,
    local_identifier: "TEMP_01",
    operational_status: true,
  });

  it("cria quando estação e tipo existem", async () => {
    const created = await new CreateSensorService(repository()).execute(
      input(1),
    );
    expect(created.station_id).toBe(1);
  });

  it("recusa estação inexistente com 409", async () => {
    const promise = new CreateSensorService(repository()).execute(input(99));
    await expect(promise).rejects.toBeInstanceOf(SensorReferenceNotFoundError);
    await expect(promise).rejects.toMatchObject({ statusCode: 409 });
  });

  it("recusa tipo de sensor inexistente", async () => {
    await expect(
      new CreateSensorService(repository()).execute(input(1, 99)),
    ).rejects.toThrow("Sensor type not found.");
  });

  it("valida a nova estação e o novo tipo na atualização", async () => {
    const repo = repository();
    const created = await new CreateSensorService(repo).execute(input(1));
    const update = new UpdateSensorService(repo);

    await expect(update.execute(created.id, input(99))).rejects.toThrow(
      "Station not found",
    );
    await expect(update.execute(created.id, input(1, 99))).rejects.toThrow(
      "Sensor type not found.",
    );
    await expect(update.execute(created.id, input(2))).resolves.toMatchObject({
      station_id: 2,
    });
  });
});
