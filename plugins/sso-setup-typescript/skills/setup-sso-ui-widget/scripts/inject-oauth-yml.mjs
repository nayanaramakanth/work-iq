// Phase 4a — ensure an `oauth/register` (MicrosoftEntra) action exists in the ATK lifecycle
// file (replaces PowerShell regex/substring surgery). Prints the env keys the skill reads back.
// Usage: node inject-oauth-yml.mjs <ymlPath>
// Prints: AUTH_ID_KEY=... / APP_ID_URI_KEY=... / INJECTED=true|false
import { readFileSync, writeFileSync } from "node:fs";

const ymlPath = process.argv[2];
if (!ymlPath) {
  console.error("usage: node inject-oauth-yml.mjs <ymlPath>");
  process.exit(1);
}

let yml = readFileSync(ymlPath, "utf8");

if (/oauth\/register/.test(yml)) {
  const authId = (yml.match(/configurationId:\s*([A-Z0-9_]+)/) || [])[1] || "MCP_DA_OAUTH_AUTH_ID";
  const appIdUri = (yml.match(/applicationIdUri:\s*([A-Z0-9_]+)/) || [])[1] || "MCP_DA_OAUTH_APP_ID_URI";
  console.log(`AUTH_ID_KEY=${authId}`);
  console.log(`APP_ID_URI_KEY=${appIdUri}`);
  console.log("INJECTED=false");
  process.exit(0);
}

// ${{...}} below are literal ATK placeholders — keep them as plain text (no JS interpolation).
const action = [
  "  - uses: oauth/register",
  "    with:",
  "      name: daSso",
  "      flow: authorizationCode",
  "      appId: ${{TEAMS_APP_ID}}",
  "      clientId: ${{AAD_APP_CLIENT_ID}}",
  "      identityProvider: MicrosoftEntra",
  "      baseUrl: ${{MCP_SERVER_URL}}",
  "    writeToEnvironmentFile:",
  "      configurationId: MCP_DA_OAUTH_AUTH_ID",
  "      applicationIdUri: MCP_DA_OAUTH_APP_ID_URI",
  "",
  "",
].join("\n");

const zipMarker = "- uses: teamsApp/zipAppPackage";
const zipIdx = yml.indexOf(zipMarker);
const provMatch = yml.match(/^provision:\s*$/m);

if (zipIdx >= 0) {
  // Main yml shape — insert just before the zipAppPackage action line.
  const lineStart = yml.lastIndexOf("\n", zipIdx) + 1;
  yml = yml.slice(0, lineStart) + action + yml.slice(lineStart);
} else if (provMatch) {
  // Local yml shape — insert as the FIRST action under the existing provision: stage.
  const pIdx = provMatch.index;
  const lineEnd = yml.indexOf("\n", pIdx) + 1;
  yml = yml.slice(0, lineEnd) + action + yml.slice(lineEnd);
} else {
  // No provision stage yet — create one.
  yml = yml.replace(/\s+$/, "") + "\n\nprovision:\n" + action;
}

writeFileSync(ymlPath, yml, "utf8");
console.log("AUTH_ID_KEY=MCP_DA_OAUTH_AUTH_ID");
console.log("APP_ID_URI_KEY=MCP_DA_OAUTH_APP_ID_URI");
console.log("INJECTED=true");
