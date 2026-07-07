// dev-tunnel.md — parse `devtunnel show <name>` output (piped via stdin) and extract the
// tunnel host (replaces PowerShell Where-Object/-replace parsing).
// Usage: devtunnel show <name> | node tunnel-url.mjs
// Prints: TUNNEL_HOST=<host> / BASE_URL=https://<host>
let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

const lines = input.split(/\r?\n/);
const line =
  lines.find((l) => /Connect via browser/.test(l) && /https:\/\//.test(l)) ||
  lines.find((l) => /https:\/\//.test(l)) ||
  "";

const m = line.match(/https:\/\/([^/\s]+)/);
const host = m ? m[1].trim() : "";
if (!host) {
  console.error("ERROR: could not parse a tunnel host from `devtunnel show` output.");
  process.exit(1);
}
console.log(`TUNNEL_HOST=${host}`);
console.log(`BASE_URL=https://${host}`);
