// Phase 7a — write the SSO auth guard (auth.ts) into the MCP server's source dir
// (replaces PowerShell Set-Content of a here-string). Content comes from templates/auth.ts.tmpl.
// Usage: node write-auth-ts.mjs <destAuthTsPath>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dest = process.argv[2];
if (!dest) {
  console.error("usage: node write-auth-ts.mjs <destAuthTsPath>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, "templates", "auth.ts.tmpl"), "utf8");
writeFileSync(dest, template, "utf8");
console.log(`WROTE=${dest}`);
