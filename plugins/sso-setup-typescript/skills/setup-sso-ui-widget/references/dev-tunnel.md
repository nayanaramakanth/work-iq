# Dev Tunnel Setup

> **Applies to local backends only.** Run this when `$BackendIsLocal` is `$true` (always for MCP during dev; for API plugins only when the user chose "Local"). If the backend is hosted remotely, skip this file — `$BaseUrl` and `$TunnelHost` were already captured in Phase 2.

> **Tell the user:**
> **Setting up a dev tunnel.** M365 Copilot runs in Microsoft's cloud, but your backend runs on `localhost` — they can't talk to each other directly. A dev tunnel creates a secure public HTTPS URL (like `https://your-tunnel.devtunnels.ms`) that forwards traffic to your local machine, bridging the gap between the cloud and your laptop.
>
> Without this, Copilot's requests would have nowhere to go — your agent would be invisible to the outside world. In production, you'd deploy to Azure App Service instead and wouldn't need a tunnel.

---

## Login to Dev Tunnel

Check dev-tunnel login, and log in if needed:
```
devtunnel user show
```
If that shows you're not logged in, run:
```
devtunnel user login
```

## Create Tunnel

> **CRITICAL**: Dev tunnel names must be **all lowercase**, 1-60 chars, matching `[a-z0-9][a-z0-9-]{1,58}[a-z0-9]`. Convert your app name to lowercase and remove any invalid characters.

Derive a valid tunnel name from the app name (all-lowercase, valid chars, length-clamped, hyphen-trimmed) → `$TunnelName`:
```
node "$SsoScripts/tunnel-name.mjs" "$AppDisplayName"
```
Capture `TUNNEL_NAME` → `$TunnelName`, then create the tunnel + port:
```
devtunnel create $TunnelName --allow-anonymous --host-header unchanged
devtunnel port create $TunnelName -p $Port
```

## Get Tunnel URL

Pipe `devtunnel show` through the parser to extract the host:
```
devtunnel show $TunnelName | node "$SsoScripts/tunnel-url.mjs"
```
Capture `TUNNEL_HOST` → `$TunnelHost` and `BASE_URL` → `$BaseUrl`.

> **Dev tunnel hostnames**: Each tunnel has TWO valid hostnames:
> - **Named**: `<tunnel-name>-<port>.<region>.devtunnels.ms` (stable, based on tunnel name)
> - **Random short ID**: `<random>-<port>.<region>.devtunnels.ms` (from `devtunnel host` output)
>
> Both route to the same tunnel. **Always use the named hostname** for config files because it stays consistent across restarts.

---

## For Remote / Azure Deployment (skip tunnel)

If the backend is already hosted (Azure App Service, Functions, etc.), you don't need a tunnel — set `$BaseUrl` to `https://<host>.azurewebsites.net` and `$TunnelHost` to `<host>.azurewebsites.net` (this is normally captured in Phase 2 when the user chooses "Remote").

---

## Done

Return to the main SKILL.md and continue with **Phase 5 (ATK OAuth Registration)**.

You now have: `$TunnelName`, `$BaseUrl`, `$TunnelHost`.
