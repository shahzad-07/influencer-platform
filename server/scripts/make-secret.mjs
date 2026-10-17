import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

// Makes one production secret and copies it to the clipboard.
// The value is never printed and never written to a file.
const KINDS = {
  jwt: {
    name: "JWT_SECRET",
    make: () => randomBytes(48).toString("base64url"),
  },
  payment: {
    name: "PAYMENT_ENCRYPTION_KEY",
    make: () => randomBytes(32).toString("hex"),
  },
};

const kind = KINDS[process.argv[2]];
if (!kind) {
  console.error("Use one of:");
  console.error("  node scripts/make-secret.mjs jwt");
  console.error("  node scripts/make-secret.mjs payment");
  process.exit(1);
}

const value = kind.make();
const result = spawnSync("clip", {
  input: value,
  stdio: ["pipe", "ignore", "pipe"],
});

if (result.error || result.status !== 0) {
  console.error("Could not copy to the clipboard, so nothing was made.");
  console.error("This script needs Windows (the clip command).");
  process.exit(1);
}

console.log(
  `${kind.name} is on your clipboard (${value.length} characters, not displayed).`,
);
console.log("Paste it into your password manager and into Render now.");
console.log("Then copy any other text to replace it on the clipboard.");
