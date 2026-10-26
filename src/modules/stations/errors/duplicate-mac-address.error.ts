import { ApplicationError } from "@/errors/application.error.js";

export class DuplicateMacAddressError extends ApplicationError {
  constructor() {
    super(
      409,
      "DUPLICATE_MAC_ADDRESS",
      "A station with this MAC address already exists.",
    );
  }
}
