import { UnauthorizedError } from "@/modules/auth/auth.errors.js";
import type { AuthRepositoryPort } from "@/modules/auth/repositories/auth.repository.js";
import type { Credential } from "@/modules/auth/types.js";
import { verifyPassword } from "@/modules/users/services/password-hasher.js";

// Matching scrypt cost even for an unknown account; this is not a usable credential.
const dummyHash = `scrypt$16384$8$1$${"00".repeat(16)}$${"00".repeat(64)}`;

export class LoginService {
  constructor(private readonly repository: AuthRepositoryPort) {}

  async login(email: string, password: string): Promise<Credential> {
    const credential = await this.repository.findCredentialByEmail(email);
    const valid = await verifyPassword(
      password,
      credential?.password_hash ?? dummyHash,
    );
    if (!credential?.active || !valid) throw new UnauthorizedError();
    return credential;
  }
}
