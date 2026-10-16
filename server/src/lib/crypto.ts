import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // the recommended nonce size for GCM

// Read on every call, so a missing or bad key fails loudly instead of silently
function getKey(): Buffer {
  const hex = process.env.PAYMENT_ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "PAYMENT_ENCRYPTION_KEY must be 64 hex characters (32 bytes)",
    );
  }
  return Buffer.from(hex, "hex");
}

// Output format: v1:<iv>:<auth tag>:<encrypted data>, all base64.
// The "v1" prefix lets us rotate keys or change the method later.
export function encryptText(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptText(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || dataB64 === undefined) {
    throw new Error("Unsupported encrypted format");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(), // throws if the data or tag was changed
  ]);
  return decrypted.toString("utf8");
}

// Handy for storing a whole set of fields as one encrypted value
export function encryptJson(value: unknown): string {
  return encryptText(JSON.stringify(value));
}

export function decryptJson<T>(payload: string): T {
  return JSON.parse(decryptText(payload)) as T;
}
