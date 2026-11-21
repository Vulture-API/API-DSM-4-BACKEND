import { ApplicationError } from "@/errors/application.error.js";

export class ReportPropertyNotFoundError extends ApplicationError {
  constructor(propertyId: number) {
    super(
      404,
      "PROPERTY_NOT_FOUND",
      `A propriedade com ID ${propertyId} não foi encontrada no sistema.`,
    );
  }
}
