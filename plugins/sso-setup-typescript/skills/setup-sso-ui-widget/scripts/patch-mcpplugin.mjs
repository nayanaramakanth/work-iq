// Phase 6 — switch the ui-widget runtime auth in mcpPlugin.json from None to the SSO
// registration (replaces PowerShell JSON cmdlets). Leaves spec.url's ${{MCP_SERVER_URL}}/mcp
// placeholder intact so ATK resolves it from env/.env.local.
// Usage: node patch-mcpplugin.mjs <mcpPluginPath> <authId>
import { readFileSync, writeFileSync } from "node:fs";

const [pluginPath, authId] = process.argv.slice(2);
if (!pluginPath || !authId) {
  console.error("usage: node patch-mcpplugin.mjs <mcpPluginPath> <authId>");
  process.exit(1);
}

const mcp = JSON.parse(readFileSync(pluginPath, "utf8"));
for (const rt of mcp.runtimes ?? []) {
  if (rt.type === "RemoteMCPServer") {
    rt.auth = { type: "OAuthPluginVault", reference_id: authId };
  }
}
writeFileSync(pluginPath, JSON.stringify(mcp, null, 2) + "\n", "utf8");
console.log(`mcpPlugin.json: runtime auth -> OAuthPluginVault (${authId})`);
