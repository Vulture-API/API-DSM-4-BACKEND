import { randomBytes, scrypt } from "node:crypto";
const cost = 16384;
const blockSize = 8;
const parallelization = 1;

export type PasswordHasher = (password: string) => Promise<string>;

export const hashPassword: PasswordHasher = async (password) => {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt);

  return [
    "scrypt",
    cost,
    blockSize,
    parallelization,
    salt.toString("hex"),
    derivedKey.toString("hex"),
  ].join("$");
};

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: cost, r: blockSize, p: parallelization },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(key);
      },
    );
  });
}
