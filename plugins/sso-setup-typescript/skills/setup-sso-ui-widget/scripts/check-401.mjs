// Phase 10 — verify an unauthenticated POST /mcp is rejected with 401 (replaces PowerShell
// Invoke-WebRequest). Uses Node's global fetch (Node >= 20).
// Usage: node check-401.mjs <mcpUrl>   e.g. http://localhost:3001/mcp
const url = process.argv[2];
if (!url) {
  console.error("usage: node check-401.mjs <mcpUrl>");
  process.exit(1);
}

const body = JSON.stringify({
  jsonrpc: "2.0",
  method: "initialize",
  id: 1,
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0" },
  },
});

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (res.status === 401) {
    console.log("VERIFIED: 401 Unauthorized — SSO guard working");
  } else if (res.status === 200) {
    console.log("WARNING: Got 200 — auth not enforced. Check the Phase 7 guard insertion.");
  } else {
    console.log(`Got HTTP ${res.status}`);
  }
} catch (err) {
  console.log(`ERROR: could not reach ${url} — is the server running? (${err.message})`);
  process.exit(1);
}
