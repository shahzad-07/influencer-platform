import "dotenv/config";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import mongoose from "mongoose";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const OLD_KEY_NAME = "PAYMENT_ENCRYPTION_KEY_OLD";
const NEW_KEY_NAME = "PAYMENT_ENCRYPTION_KEY_NEW";
const COLLECTION_NAME = "payment_details";
const args = new Set(process.argv.slice(2));
class RotationError extends Error {}

const allowedArgs = new Set([
  "--help",
  "--self-test",
  "--apply",
  "--backup-verified",
  "--server-stopped",
  "--confirm-production",
]);

function usage() {
  console.log(`Payment details key rotation (run from server/)

Default is a read-only dry run:
  node scripts/rotate-payment-key.mjs

Apply only after a verified database backup and after stopping the API:
  node scripts/rotate-payment-key.mjs --apply --backup-verified --server-stopped

For the production database, also pass --confirm-production and type the
confirmation phrase shown by the script. Keys are read only from environment
variables ${OLD_KEY_NAME} and ${NEW_KEY_NAME}; never pass keys as arguments.

Safe, database-free check:
  node scripts/rotate-payment-key.mjs --self-test`);
}

function requireKey(name) {
  const value = process.env[name] ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new RotationError(`${name} must contain exactly 64 hexadecimal characters`);
  }
  return Buffer.from(value, "hex");
}

function encryptText(plainText, key) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptText(payload, key) {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || dataB64 === undefined) {
    throw new Error("Invalid encrypted value");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function decryptWithEitherKey(payload, oldKey, newKey) {
  try {
    return { plaintext: decryptText(payload, oldKey), alreadyNew: false };
  } catch {
    try {
      return { plaintext: decryptText(payload, newKey), alreadyNew: true };
    } catch {
      return null;
    }
  }
}

async function inspectCollection(collection, oldKey, newKey) {
  let total = 0;
  let needsRotation = 0;
  let alreadyNew = 0;

  for await (const document of collection.find(
    {},
    { projection: { _id: 1, data: 1 } },
  )) {
    total += 1;
    if (typeof document.data !== "string") {
      throw new RotationError(
        "Preflight failed: an encrypted payment record is invalid; no records were changed",
      );
    }
    const result = decryptWithEitherKey(document.data, oldKey, newKey);
    if (!result) {
      throw new RotationError(
        "Preflight failed: at least one payment record cannot be read with either supplied key; no records were changed",
      );
    }
    if (result.alreadyNew) alreadyNew += 1;
    else needsRotation += 1;
  }

  return { total, needsRotation, alreadyNew };
}

async function rotateCollection(collection, oldKey, newKey, apply) {
  const preflight = await inspectCollection(collection, oldKey, newKey);
  if (!apply) return { ...preflight, migrated: 0 };

  let migrated = 0;
  for await (const document of collection.find(
    {},
    { projection: { _id: 1, data: 1 } },
  )) {
    const result = decryptWithEitherKey(document.data, oldKey, newKey);
    if (!result) {
      throw new RotationError(
        "Rotation stopped because a record could not be decrypted. Keep both keys and rerun after investigating",
      );
    }
    if (result.alreadyNew) continue;

    const replacement = encryptText(result.plaintext, newKey);
    const write = await collection.updateOne(
      { _id: document._id, data: document.data },
      { $set: { data: replacement } },
    );
    if (write.matchedCount !== 1) {
      throw new RotationError(
        "Rotation stopped because a record changed during migration. Keep both keys and rerun after investigating",
      );
    }
    migrated += 1;
  }

  try {
    let verified = 0;
    for await (const document of collection.find(
      {},
      { projection: { _id: 1, data: 1 } },
    )) {
      decryptText(document.data, newKey);
      verified += 1;
    }
    if (verified !== preflight.total) {
      throw new RotationError("Verification counts did not match");
    }
  } catch {
    throw new RotationError(
      "Post-migration verification failed. Keep both keys and rerun after investigating",
    );
  }

  return { ...preflight, migrated };
}

function makeMemoryCollection(documents) {
  return {
    find() {
      return (async function* () {
        for (const document of documents) yield { ...document };
      })();
    },
    async updateOne(filter, update) {
      const document = documents.find(
        (candidate) =>
          candidate._id === filter._id && candidate.data === filter.data,
      );
      if (!document) return { matchedCount: 0 };
      document.data = update.$set.data;
      return { matchedCount: 1 };
    },
  };
}

async function selfTest() {
  const oldKey = Buffer.alloc(32, 1);
  const newKey = Buffer.alloc(32, 2);
  const documents = [
    { _id: "old", data: encryptText("old-key record", oldKey) },
    { _id: "new", data: encryptText("already rotated", newKey) },
  ];
  const collection = makeMemoryCollection(documents);

  const dryRun = await rotateCollection(collection, oldKey, newKey, false);
  if (
    dryRun.total !== 2 ||
    dryRun.needsRotation !== 1 ||
    dryRun.alreadyNew !== 1 ||
    dryRun.migrated !== 0
  ) {
    throw new RotationError("Dry-run self-test failed");
  }
  if (decryptText(documents[0].data, oldKey) !== "old-key record") {
    throw new RotationError("Dry run changed a record");
  }

  const applied = await rotateCollection(collection, oldKey, newKey, true);
  if (
    applied.migrated !== 1 ||
    applied.needsRotation !== 1 ||
    decryptText(documents[0].data, newKey) !== "old-key record" ||
    decryptText(documents[1].data, newKey) !== "already rotated"
  ) {
    throw new RotationError("Apply self-test failed");
  }

  const resumed = await rotateCollection(collection, oldKey, newKey, true);
  if (resumed.migrated !== 0 || resumed.alreadyNew !== 2) {
    throw new RotationError("Resume self-test failed");
  }

  const protectedDocuments = [
    { _id: "valid", data: encryptText("must remain untouched", oldKey) },
    { _id: "invalid", data: "not-encrypted-data" },
  ];
  let preflightRejected = false;
  try {
    await rotateCollection(
      makeMemoryCollection(protectedDocuments),
      oldKey,
      newKey,
      true,
    );
  } catch {
    preflightRejected = true;
  }
  if (
    !preflightRejected ||
    decryptText(protectedDocuments[0].data, oldKey) !== "must remain untouched"
  ) {
    throw new RotationError("Corrupt-record preflight self-test failed");
  }

  console.log("PASS  Dry run leaves encrypted records unchanged");
  console.log("PASS  Apply rotates old-key records and verifies with the new key");
  console.log("PASS  Re-running safely skips records already on the new key");
  console.log("PASS  Corrupt-record preflight aborts before changing any record");
  console.log("All key-rotation self-tests passed; no database was used.");
}

async function confirmApply(databaseName) {
  if (!args.has("--backup-verified") || !args.has("--server-stopped")) {
    throw new RotationError(
      "Apply requires --backup-verified and --server-stopped after the API is stopped and a verified backup exists",
    );
  }
  if (databaseName === "influencerprod" && !args.has("--confirm-production")) {
    throw new RotationError(
      "Production apply also requires --confirm-production and the typed confirmation phrase",
    );
  }
  if (!process.stdin.isTTY) {
    throw new RotationError("Apply requires an interactive terminal confirmation");
  }

  const phrase = `ROTATE PAYMENT DETAILS ${databaseName}`;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const response = await prompt.question(
      `This will rewrite encrypted payment details in database ${databaseName}. Type exactly: ${phrase}\n> `,
    );
    if (response !== phrase) {
      throw new RotationError("Confirmation did not match; no records were changed");
    }
  } finally {
    prompt.close();
  }
}

async function main() {
  for (const arg of args) {
    if (!allowedArgs.has(arg)) throw new RotationError("Unknown option; use --help");
  }
  if (args.has("--help")) return usage();
  if (args.has("--self-test")) {
    if (args.size !== 1) throw new RotationError("Use --self-test by itself");
    return selfTest();
  }
  if (args.has("--confirm-production") && !args.has("--apply")) {
    throw new RotationError("--confirm-production is only valid together with --apply");
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new RotationError("MONGODB_URI is missing");
  const oldKey = requireKey(OLD_KEY_NAME);
  const newKey = requireKey(NEW_KEY_NAME);
  if (oldKey.equals(newKey)) throw new RotationError("Old and new keys must be different");

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const databaseName = mongoose.connection.name;
    if (!databaseName) throw new RotationError("Connected database name could not be verified");
    if (args.has("--apply")) await confirmApply(databaseName);

    const collection = mongoose.connection.db?.collection(COLLECTION_NAME);
    if (!collection) throw new RotationError("Payment-details collection is unavailable");

    const result = await rotateCollection(
      collection,
      oldKey,
      newKey,
      args.has("--apply"),
    );
    console.log(`Database: ${databaseName}`);
    console.log(`Payment records checked: ${result.total}`);
    console.log(`Already using the new key: ${result.alreadyNew}`);
    if (args.has("--apply")) {
      console.log(`Records migrated: ${result.migrated}`);
      console.log("Verification passed for every payment record.");
      console.log(
        `Set PAYMENT_ENCRYPTION_KEY to the new key before starting the API. Keep the old key backed up until verification and application checks are complete.`,
      );
    } else {
      console.log(`Would migrate with the new key: ${result.needsRotation}`);
      console.log("Dry run only; no database records were changed.");
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  if (error instanceof RotationError) console.error(error.message);
  console.error("Payment-key rotation stopped. No key values or database URI were printed.");
  process.exitCode = 1;
});
