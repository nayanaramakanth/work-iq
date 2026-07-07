// Phase 2a — derive the Entra app display name (replaces PowerShell string/Get-Random logic).
// Usage: node app-name.mjs <appPackageDir>
// Prints: APP_DISPLAY_NAME=<base>-<alias>-<suffix>
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomInt } from "node:crypto";

const appPackageDir = process.argv[2];
if (!appPackageDir) {
  console.error("usage: node app-name.mjs <appPackageDir>");
  process.exit(1);
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

let base = "";
const manifest = readJson(join(appPackageDir, "manifest.json"));
if (manifest?.name?.short) base = manifest.name.short;
if (!base) {
  const da = readJson(join(appPackageDir, "declarativeAgent.json"));
  if (da?.name) base = da.name;
}
// Strip ATK ${{...}} tokens and anything not [A-Za-z0-9-].
base = String(base).replace(/\$\{\{[^}]+\}\}/g, "").replace(/[^A-Za-z0-9-]/g, "");
if (!base) base = "uiwidget-agent";

let alias = (process.env.USER || process.env.USERNAME || "user").toLowerCase();
if (alias.includes("\\")) alias = alias.split("\\").pop();
alias = alias.replace(/[^a-z0-9-]/g, "") || "user";

const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
let suffix = "";
for (let i = 0; i < 4; i++) suffix += chars[randomInt(chars.length)];

console.log(`APP_DISPLAY_NAME=${base}-${alias}-${suffix}`);
