// Phase 9 — locate the built app-package zip (replaces PowerShell Test-Path/Get-ChildItem).
// Prefers <appPackageDir>/build/appPackage.zip, else recursively finds the first appPackage*.zip.
// Usage: node find-zip.mjs <appPackageDir>
// Prints: ZIP_PATH=<path>  (empty if none found)
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const appPackageDir = process.argv[2] || "appPackage";
const preferred = join(appPackageDir, "build", "appPackage.zip");

function findFirst(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return "";
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      const hit = findFirst(full);
      if (hit) return hit;
    } else if (/^appPackage.*\.zip$/.test(e.name)) {
      return full;
    }
  }
  return "";
}

let zip = "";
if (existsSync(preferred) && statSync(preferred).isFile()) {
  zip = preferred;
} else {
  zip = findFirst(".");
}
console.log(`ZIP_PATH=${zip}`);
