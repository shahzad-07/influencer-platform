import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { join, relative, sep, basename } from "node:path";

// Run from the server folder:
//   node scripts/make-snapshot.mjs                    -> writes project-map.md
//   node scripts/make-snapshot.mjs path1 path2 ...    -> writes project-files.md
// Paths are relative to the project root, e.g. client/src/pages/Deals.tsx
const root = join(process.cwd(), "..");
if (!existsSync(join(root, "client")) || !existsSync(join(root, "server"))) {
  console.error("Run this from the server folder of the project.");
  process.exit(1);
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".vite",
  "coverage",
]);
const isSecretFile = (name) =>
  name === ".env" || (name.startsWith(".env.") && name !== ".env.example");
const toPosix = (p) => p.split(sep).join("/");
const read = (f) => readFileSync(f, "utf8");
const linesOf = (f) => read(f).split(/\r?\n/);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...walk(join(dir, entry.name)));
    } else if (!isSecretFile(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

// Safety net: blank out anything that looks like a secret
function redact(text) {
  return text
    .replace(/mongodb(\+srv)?:\/\/[^\s"'`]+/g, "mongodb://REDACTED")
    .replace(
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
      "REDACTED_TOKEN",
    )
    .replace(/\b[0-9a-fA-F]{64}\b/g, "REDACTED_HEX")
    .replace(
      /^(JWT_SECRET|PAYMENT_ENCRYPTION_KEY|MONGODB_URI)=.+$/gm,
      "$1=REDACTED",
    );
}

function report(file, text) {
  writeFileSync(join(root, file), text);
  console.log(
    `Wrote ${file} in the project root (${text.length} characters, about ${Math.round(text.length / 4)} tokens).`,
  );
}

const args = process.argv.slice(2);

// ---- Mode 2: bundle the files you name ----
if (args.length > 0) {
  let out = "# Selected project files (secrets removed)\n\n";
  for (const arg of args) {
    const abs = join(root, arg);
    const rel = toPosix(relative(root, abs));
    if (rel.startsWith("..")) {
      console.error(`Skipped, outside the project: ${arg}`);
      continue;
    }
    if (
      isSecretFile(basename(abs)) ||
      rel.split("/").includes("node_modules")
    ) {
      console.error(`Skipped, not allowed: ${arg}`);
      continue;
    }
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      console.error(`Not found: ${arg}`);
      continue;
    }
    out += `## ${rel}\n\n\`\`\`\`\n${redact(read(abs))}\n\`\`\`\`\n\n`;
  }
  report("project-files.md", out);
  process.exit(0);
}

// ---- Mode 1: the project map ----
let out = "# Project map (generated, contains no secrets)\n\n";
out += `Generated ${new Date().toISOString().slice(0, 10)}. React (Vite, TypeScript) client, Node + Express + Mongoose server, MongoDB Atlas.\n\n`;

out += "## Files (line counts)\n\n";
for (const d of ["client/src", "server/src", "server/scripts"]) {
  const base = join(root, d);
  if (!existsSync(base)) continue;
  for (const f of walk(base).sort()) {
    out += `- ${toPosix(relative(root, f))} (${linesOf(f).length})\n`;
  }
}

out += "\n## Packages\n";
for (const p of ["client", "server"]) {
  const file = join(root, p, "package.json");
  if (!existsSync(file)) continue;
  const j = JSON.parse(read(file));
  const list = (o) =>
    Object.entries(o ?? {})
      .map(([k, v]) => `${k}@${v}`)
      .join(", ") || "none";
  out += `\n### ${p}\n- dependencies: ${list(j.dependencies)}\n- devDependencies: ${list(j.devDependencies)}\n- scripts: ${Object.keys(j.scripts ?? {}).join(", ")}\n`;
}

const envExample = join(root, "server", ".env.example");
if (existsSync(envExample)) {
  const names = linesOf(envExample)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => l.split("=")[0]);
  out += `\n## Server environment variables (names only)\n\n${names.join(", ")}\n`;
}

const serverSrc = join(root, "server/src");

const indexFile = join(serverSrc, "index.ts");
if (existsSync(indexFile)) {
  out += "\n## Server: routes mounted in index.ts\n\n";
  for (const l of linesOf(indexFile)) {
    if (/app\.use\(\s*"\/api/.test(l)) out += `- ${l.trim()}\n`;
  }
}

out += "\n## Server: endpoints (as written, with their guards)\n";
for (const f of walk(serverSrc).sort()) {
  if (!f.endsWith(".routes.ts")) continue;
  const hits = linesOf(f).filter((l) =>
    /^\s*router\.(get|post|put|patch|delete)\(/.test(l),
  );
  out += `\n### ${toPosix(relative(root, f))}\n${hits.map((l) => `- ${l.trim().slice(0, 150)}`).join("\n")}\n`;
}

out += "\n## Server: database models\n\n";
for (const f of walk(serverSrc).sort()) {
  if (!f.endsWith(".ts")) continue;
  for (const l of linesOf(f)) {
    if (/export const \w+ = model\(/.test(l))
      out += `- ${toPosix(relative(root, f))}: ${l.trim()}\n`;
  }
}

const appFile = join(root, "client/src/App.tsx");
if (existsSync(appFile)) {
  out += "\n## Client: pages and routes (App.tsx)\n\n";
  for (const l of linesOf(appFile)) {
    const m = l.match(/path="([^"]+)"/);
    if (m) out += `- ${m[1]}\n`;
  }
}

out += "\nNot included: node_modules, .env files, package-lock.json.\n";
report("project-map.md", out);
