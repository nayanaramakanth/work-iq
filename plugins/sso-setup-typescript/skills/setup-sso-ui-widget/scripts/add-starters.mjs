// Phase 6b — conditionally add two identity conversation_starters ONLY when the agent has
// none of its own (replaces PowerShell ConvertFrom-Json/Add-Member/Set-Content).
// Usage: node add-starters.mjs <declarativeAgentJsonPath>
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const daPath = process.argv[2];
if (!daPath) {
  console.error("usage: node add-starters.mjs <declarativeAgentJsonPath>");
  process.exit(1);
}
if (!existsSync(daPath)) {
  console.log("SKIPPED: declarativeAgent.json not found");
  process.exit(0);
}

const da = JSON.parse(readFileSync(daPath, "utf8"));
const existing = Array.isArray(da.conversation_starters) ? da.conversation_starters : [];
if (existing.length > 0) {
  console.log(`KEPT=${existing.length}`);
  process.exit(0);
}

da.conversation_starters = [
  { title: "Show my profile", text: "Show my profile" },
  { title: "Greet by name", text: "Greet me by name" },
];
writeFileSync(daPath, JSON.stringify(da, null, 2) + "\n", "utf8");
console.log("ADDED=2");
