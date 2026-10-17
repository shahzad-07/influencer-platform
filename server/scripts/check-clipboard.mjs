import { spawnSync } from "node:child_process";

// Looks at what is on the clipboard and says whether it is a clean
// 64-character hex key. It never prints the text itself, only the length and
// the codes of characters that are not 0-9 or a-f.
const NAMES = {
  9: "tab",
  10: "line feed",
  13: "carriage return",
  32: "space",
  160: "non-breaking space",
  65279: "byte order mark",
};
const isHex = (c) =>
  (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);

const ps = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    "[string]::Join(',', [int[]][char[]](Get-Clipboard -Raw))",
  ],
  { encoding: "utf8" },
);

if (ps.error || ps.status !== 0) {
  console.error(
    "Could not read the clipboard (this needs Windows PowerShell).",
  );
  process.exit(1);
}

const codes = ps.stdout
  .trim()
  .split(",")
  .filter((s) => s !== "")
  .map(Number);

if (codes.length === 0) {
  console.log("The clipboard is empty or does not hold text.");
  process.exit(1);
}

const others = [];
codes.forEach((c, i) => {
  if (!isHex(c)) others.push({ i, c });
});

console.log(`The clipboard holds ${codes.length} characters.`);
console.log(
  `Hex characters: ${codes.length - others.length}. Other characters: ${others.length}.`,
);
for (const { i, c } of others.slice(0, 10)) {
  const where =
    i === 0
      ? "at the start"
      : i === codes.length - 1
        ? "at the end"
        : `at position ${i + 1}`;
  console.log(`  code ${c} (${NAMES[c] ?? "other"}) ${where}`);
}
if (others.length > 10) console.log(`  ...and ${others.length - 10} more`);

if (codes.length === 64 && others.length === 0) {
  console.log("OK: this is a clean 64-character hex key.");
} else {
  console.log("NOT OK: do not use this.");
  process.exit(1);
}
