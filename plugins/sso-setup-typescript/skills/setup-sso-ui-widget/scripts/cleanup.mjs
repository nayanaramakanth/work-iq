// Phase 11 — remove only transient SSO scratch files this flow could have produced
// (replaces PowerShell Remove-Item globs). Never touches ui-widget's own background-process
// files (tunnel.log, server.log, pids.txt, etc.) or any source/config/env/build output.
// Usage: node cleanup.mjs   (run from project root)
import { readdirSync, rmSync, existsSync } from "node:fs";

const exact = [
  "server-sso.out.log",
  "server-sso.err.log",
  "server-pid.txt",
  "sso-state.json",
];
const patterns = [
  "sso-step*.ps1",
  "sso-*.log",
  "sso-*.txt",
  "sso-precheck*",
  "sso-provision*.log",
  "sso-az.txt",
  "sso-atkcheck.txt",
];

const toRegex = (glob) =>
  new RegExp("^" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
const regexes = patterns.map(toRegex);

let removed = 0;
for (const f of exact) {
  if (existsSync(f)) {
    try {
      rmSync(f, { force: true });
      removed++;
    } catch {
      /* ignore */
    }
  }
}
let entries = [];
try {
  entries = readdirSync(".", { withFileTypes: true });
} catch {
  /* ignore */
}
for (const e of entries) {
  if (!e.isFile()) continue;
  if (regexes.some((r) => r.test(e.name))) {
    try {
      rmSync(e.name, { force: true });
      removed++;
    } catch {
      /* ignore */
    }
  }
}
console.log(
  `SSO scratch cleaned (${removed} file(s)) — ui-widget logs (tunnel.log/server.log/pids.txt) left intact`
);
