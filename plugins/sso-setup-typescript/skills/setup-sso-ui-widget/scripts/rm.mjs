// rm — delete files portably (replaces PowerShell Remove-Item for the az rest body temp file, etc.).
// Usage: node rm.mjs <path> [<path> ...]
import { rmSync } from "node:fs";
for (const p of process.argv.slice(2)) {
  try {
    rmSync(p, { force: true });
  } catch {
    /* ignore */
  }
}
