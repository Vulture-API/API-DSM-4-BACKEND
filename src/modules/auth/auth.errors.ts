import { ApplicationError } from "@/errors/application.error.js";

export class UnauthorizedError extends ApplicationError {
  constructor() {
    super(401, "UNAUTHORIZED", "Invalid credentials or authentication token.");
  }
}
export class ForbiddenError extends ApplicationError {
  constructor() {
    super(
      403,
      "FORBIDDEN",
      "You do not have permission to perform this action.",
    );
  }
}
export class AuthUnavailableError extends ApplicationError {
  constructor() {
    super(503, "AUTH_UNAVAILABLE", "Authentication is not configured.");
  }
}
