import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
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

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  const parts = hash.split("$");
  const [algorithm, n, r, p, salt, key] = parts;
  if (
    parts.length !== 6 ||
    algorithm !== "scrypt" ||
    n !== String(cost) ||
    r !== String(blockSize) ||
    p !== String(parallelization) ||
    !salt ||
    !/^(?:[a-f0-9]{2}){1,64}$/i.test(salt) ||
    !key ||
    !/^[a-f0-9]{128}$/i.test(key)
  )
    return false;
  const derived = await deriveKey(password, Buffer.from(salt, "hex"));
  return timingSafeEqual(derived, Buffer.from(key, "hex"));
}
