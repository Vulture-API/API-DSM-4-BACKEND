import { ApplicationError } from "@/errors/application.error.js";

export class RoleNotFoundError extends ApplicationError {
  constructor() {
    super(404, "Role not found.");
  }
}

export class RoleNameConflictError extends ApplicationError {
  constructor() {
    super(409, "A role with this name already exists.");
  }
}

export class RoleDeletionConflictError extends ApplicationError {
  constructor() {
    super(
      409,
      "The role cannot be deleted because it is referenced by a user.",
    );
  }
}
