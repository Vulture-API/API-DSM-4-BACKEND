import { ApplicationError } from "@/errors/application.error.js";

export class UserNotFoundError extends ApplicationError {
  constructor() {
    super(404, "User not found.");
  }
}

export class RoleNotFoundError extends ApplicationError {
  constructor() {
    super(404, "Role not found.");
  }
}

export class EmailAlreadyExistsError extends ApplicationError {
  constructor() {
    super(409, "A user with this email already exists.");
  }
}

export class UserDeletionConflictError extends ApplicationError {
  constructor() {
    super(
      409,
      "The user cannot be deleted because it is referenced by another resource.",
    );
  }
}
