import { ApplicationError } from "@/errors/application.error.js";

export class UserReferenceNotFoundError extends ApplicationError {
  constructor() {
    super(409, "USER_NOT_FOUND", "The referenced owner user does not exist.");
  }
}

export class PropertyNotFoundError extends ApplicationError {
  constructor() {
    super(404, "PROPERTY_NOT_FOUND", "Property not found.");
  }
}

export class PropertyDeletionConflictError extends ApplicationError {
  constructor(
    message = "Cannot delete property because it has associated stations.",
  ) {
    super(409, "PROPERTY_HAS_STATIONS", message);
  }
}
