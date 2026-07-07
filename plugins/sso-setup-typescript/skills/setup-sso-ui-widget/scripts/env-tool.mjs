// env-tool — read/upsert keys in an env file (replaces PowerShell Get-Content/Set-EnvLine/Set-Content).
// Usage:
//   node env-tool.mjs get <envFile> KEY1 KEY2 ...        -> prints KEY=value per line (empty if absent/unset)
//   node env-tool.mjs set <envFile> KEY=VALUE ...         -> upserts each pair (overwrites), writes the file
//   node env-tool.mjs setdefault <envFile> KEY=VALUE ...  -> writes each pair ONLY if the key is absent
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [cmd, envFile, ...rest] = process.argv.slice(2);
if (!cmd || !envFile) {
  console.error("usage: node env-tool.mjs get|set|setdefault <envFile> ...");
  process.exit(1);
}

const readLines = () =>
  existsSync(envFile) ? readFileSync(envFile, "utf8").split(/\r?\n/) : [];

const writeLines = (lines) => {
  const dir = dirname(envFile);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(envFile, lines.join("\n").replace(/\n+$/, "") + "\n", "utf8");
};

if (cmd === "get") {
  const lines = readLines();
  for (const key of rest) {
    const hit = lines.find((l) => l.startsWith(key + "="));
    const val = hit ? hit.slice(key.length + 1).trim() : "";
    console.log(`${key}=${val}`);
  }
} else if (cmd === "set" || cmd === "setdefault") {
  const onlyIfMissing = cmd === "setdefault";
  const lines = readLines();
  for (const pair of rest) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const key = pair.slice(0, eq);
    const val = pair.slice(eq + 1);
    const i = lines.findIndex((l) => l.startsWith(key + "="));
    if (i >= 0) {
      if (!onlyIfMissing) lines[i] = `${key}=${val}`;
    } else {
      lines.push(`${key}=${val}`);
    }
  }
  writeLines(lines);
  const keys = rest.map((p) => p.slice(0, p.indexOf("="))).filter(Boolean);
  console.log(`env updated: ${keys.join(", ")}`);
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(1);
}
