import { ApplicationError } from "@/errors/application.error.js";

export class PropertyNotFoundError extends ApplicationError {
  constructor() {
    super(409, "PROPERTY_NOT_FOUND", "The referenced property does not exist.");
  }
}
