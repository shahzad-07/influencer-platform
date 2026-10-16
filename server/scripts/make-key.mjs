import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const KEY_NAME = "PAYMENT_ENCRYPTION_KEY";
const COMMENT =
  "# Encryption key for payment details. Keep it secret, back it up, and never change it once data is stored.";
const file = ".env";
const force = process.argv.includes("--force");

if (!existsSync(file)) {
  console.error("No .env file here. Run this from the server folder.");
  process.exit(1);
}

const lines = readFileSync(file, "utf8").split(/\r?\n/);
const keyLines = lines.filter((l) => l.startsWith(`${KEY_NAME}=`));
const hasValidKey = keyLines.some((l) =>
  /^[0-9a-fA-F]{64}$/.test(l.slice(KEY_NAME.length + 1).trim()),
);

// Replacing a real key would make everything already encrypted unreadable
if (hasValidKey && !force) {
  console.log("A valid key already exists. Nothing changed.");
  process.exit(0);
}

// Remove old key lines (including the empty ones) and our comment, tidy the end
const kept = lines.filter(
  (l) => !l.startsWith(`${KEY_NAME}=`) && l !== COMMENT,
);
while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop();

kept.push("", COMMENT, `${KEY_NAME}=${randomBytes(32).toString("hex")}`, "");
writeFileSync(file, kept.join("\n"));

console.log("New key written to .env (not displayed).");
