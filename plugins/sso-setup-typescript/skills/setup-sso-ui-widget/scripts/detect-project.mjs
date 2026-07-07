// Phase 0 — workspace detection (cross-platform, replaces PowerShell Test-Path/ConvertFrom-Json).
// Usage: node detect-project.mjs
// Run from the project root. Prints KEY=value lines the skill reads back.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function pkgHasSdk(dir) {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const p = JSON.parse(readFileSync(pkgPath, "utf8"));
    const deps = { ...(p.dependencies || {}), ...(p.devDependencies || {}) };
    return Object.prototype.hasOwnProperty.call(deps, "@modelcontextprotocol/sdk");
  } catch {
    return false;
  }
}

const appPackageDir = existsSync("appPackage/declarativeAgent.json")
  ? "appPackage"
  : existsSync("DeclarativeAgent/declarativeAgent.json")
    ? "DeclarativeAgent"
    : "";

const hasAtk = existsSync("m365agents.yml") || existsSync("teamsapp.yml");
const mcpPluginPath = appPackageDir ? join(appPackageDir, "mcpPlugin.json") : "";
const hasMcpPlugin = !!mcpPluginPath && existsSync(mcpPluginPath);
const hasAiPlugin = !!appPackageDir && existsSync(join(appPackageDir, "ai-plugin.json"));

let mcpServerDir = "";
for (const cand of ["mcp-server", "server", "."]) {
  if (pkgHasSdk(cand)) {
    mcpServerDir = cand;
    break;
  }
}

const ok = hasAtk && !!appPackageDir && hasMcpPlugin && !!mcpServerDir;

console.log(`APP_PACKAGE_DIR=${appPackageDir}`);
console.log(`HAS_ATK=${hasAtk}`);
console.log(`HAS_MCP_PLUGIN=${hasMcpPlugin}`);
console.log(`HAS_AI_PLUGIN=${hasAiPlugin}`);
console.log(`MCP_SERVER_DIR=${mcpServerDir}`);
console.log(`OK=${ok}`);
