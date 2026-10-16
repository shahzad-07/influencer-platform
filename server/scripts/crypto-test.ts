import "dotenv/config";
import {
  encryptText,
  decryptText,
  encryptJson,
  decryptJson,
} from "../src/lib/crypto";

if (!process.env.PAYMENT_ENCRYPTION_KEY) {
  console.error("PAYMENT_ENCRYPTION_KEY is missing from server/.env");
  process.exit(1);
}

let failed = false;
const check = (name: string, ok: boolean) => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
};
const throws = (fn: () => unknown) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

const secret = "Account 1234567890, IFSC HDFC0001234";
const enc = encryptText(secret);

check("Round trip returns the original text", decryptText(enc) === secret);
check(
  "Stored value does not contain the plain text",
  !enc.includes("1234567890") && !enc.includes("HDFC"),
);
check(
  "Same text encrypts differently each time",
  encryptText(secret) !== encryptText(secret),
);
check("Empty string round trips", decryptText(encryptText("")) === "");
check(
  "Unicode (rupee sign, Hindi) round trips",
  decryptText(encryptText("₹5000 नमस्ते")) === "₹5000 नमस्ते",
);

const details = {
  upiId: "name@bank",
  accountNumber: "1234567890",
  ifsc: "HDFC0001234",
};
check(
  "JSON round trips",
  JSON.stringify(decryptJson(encryptJson(details))) === JSON.stringify(details),
);

// Tampering must be detected
const [v, iv, tagB64, dataB64] = enc.split(":") as [
  string,
  string,
  string,
  string,
];

const data = Buffer.from(dataB64, "base64");
data[0] = (data[0] as number) ^ 1;
check(
  "Changed ciphertext is rejected",
  throws(() => decryptText([v, iv, tagB64, data.toString("base64")].join(":"))),
);

const tag = Buffer.from(tagB64, "base64");
tag[0] = (tag[0] as number) ^ 1;
check(
  "Changed auth tag is rejected",
  throws(() => decryptText([v, iv, tag.toString("base64"), dataB64].join(":"))),
);

check(
  "Garbage input is rejected",
  throws(() => decryptText("hello")),
);

// Key handling
const realKey = process.env.PAYMENT_ENCRYPTION_KEY;

process.env.PAYMENT_ENCRYPTION_KEY = "0".repeat(64);
check(
  "A different key cannot decrypt",
  throws(() => decryptText(enc)),
);

process.env.PAYMENT_ENCRYPTION_KEY = "too-short";
check(
  "A malformed key is rejected",
  throws(() => encryptText("x")),
);

delete process.env.PAYMENT_ENCRYPTION_KEY;
check(
  "A missing key is rejected",
  throws(() => encryptText("x")),
);

process.env.PAYMENT_ENCRYPTION_KEY = realKey;
check("Works again with the real key", decryptText(enc) === secret);

console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
process.exit(failed ? 1 : 0);
