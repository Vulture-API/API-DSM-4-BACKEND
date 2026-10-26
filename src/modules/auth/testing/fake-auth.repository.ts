import type { AuthRepositoryPort } from "@/modules/auth/repositories/auth.repository.js";
import type { AuthUser, Credential } from "@/modules/auth/types.js";

export class FakeAuthRepository implements AuthRepositoryPort {
  credentials: Credential[] = [];
  async findCredentialByEmail(email: string): Promise<Credential | null> {
    return this.credentials.find((user) => user.email === email) ?? null;
  }
  async findUserById(id: number): Promise<AuthUser | null> {
    const credential = this.credentials.find((user) => user.id === id);
    if (!credential) return null;
    const { password_hash: _hash, ...user } = credential;
    return user;
  }
}
