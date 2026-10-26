import { ApplicationError } from "@/errors/application.error.js";

/**
 * A estação ou o tipo de sensor informado não existe. 409, no mesmo padrão do
 * serviço de estações para propriedade inexistente (PROPERTY_NOT_FOUND).
 */
export class SensorReferenceNotFoundError extends ApplicationError {
  constructor(reference: "station" | "sensor_type") {
    super(
      409,
      reference === "station"
        ? "Station not found. A sensor must be linked to an existing station."
        : "Sensor type not found.",
    );
  }
}
