// dev-tunnel.md — sanitize an app display name into a valid dev-tunnel name
// (replaces PowerShell -replace/.ToLower()/.Trim()). Tunnel names must match
// [a-z0-9][a-z0-9-]{1,58}[a-z0-9], all lowercase, 1-60 chars.
// Usage: node tunnel-name.mjs <appDisplayName>
// Prints: TUNNEL_NAME=<name>
const appDisplayName = process.argv[2];
if (!appDisplayName) {
  console.error("usage: node tunnel-name.mjs <appDisplayName>");
  process.exit(1);
}
let name = (appDisplayName.replace(/[^a-z0-9-]/gi, "") + "-tunnel").toLowerCase();
if (name.length > 60) name = name.slice(0, 60);
name = name.replace(/^-+/, "").replace(/-+$/, "");
console.log(`TUNNEL_NAME=${name}`);
