---
name: setup-sso-ui-widget
description: >
  Adds Entra SSO to a Microsoft 365 Copilot declarative agent that was built with the
  ui-widget-developer skill (OAI Apps path). This skill is purpose-built for the
  ui-widget project layout:
  appPackage/mcpPlugin.json, a raw-http MCP server under mcp-server/, an already-running
  named devtunnel, and env/.env.local. It reuses the existing tunnel (never creates a second
  one), injects a minimal JWKS bearer-token guard into the existing MCP server WITHOUT
  rewriting it to express, registers the Entra app + ATK OAuth, patches mcpPlugin.json auth,
  validates, sideloads, and prints an app-registration summary. SSO only — no OBO.
  Triggered by: "add sso after ui-widget-developer", "setup sso for ui widget skill",
  "wire entra auth for my ui widget mcp server", "configure only sso no obo"
---

# Setup SSO for a ui-widget-developer Agent (Minimal-Touch, No OBO)

> **Why this exists.** The `ui-widget-developer` skill produces a distinctive project shape:
> it emits `appPackage/mcpPlugin.json` (not `ai-plugin.json`), a raw Node `http` MCP server
> under `mcp-server/` (no express, no express-jwt), a **named devtunnel that is already
> running**, and `env/.env.local`.
> This skill adapts to that layout instead of re-scaffolding, so the user's widget server
> stays intact.

> **New to how SSO works here?** Read [`references/sso-explained.md`](references/sso-explained.md)
> first — it covers what SSO gives you (verified identity, not downstream access), the
> end-to-end token flow, how claims reach your tools via `claimsStore`, failure modes, and
> how to go further with OBO / Microsoft Graph. This SKILL is the procedural runbook; that
> doc is the mental model.

> **CRITICAL EXECUTION RULES — READ BEFORE PROCEEDING:**
> - Execute every `az`, `devtunnel`, `atk`, `npm`, and PowerShell command in the TERMINAL yourself. Do NOT tell the user to run them.
> - Do NOT improvise alternate approaches for the Entra/ATK steps — reuse the shared reference files under `references/`.
> - Execute commands ONE AT A TIME, check output, diagnose failures, retry — never skip.
> - **NO SCRATCH FILES — PATTERN-BASED, NOT NAME-BASED**: Run commands **directly** in the terminal and keep all state in shell variables. NEVER create a file whose purpose is to capture, stage, or read back command output — *regardless of its name or extension* (`.txt`, `.json`, `.log`, `.ps1`, …). This ban covers redirecting with `>`, `Out-File`, `Tee-Object`, or `Set-Content` so you can read the result later. **Permitted exception:** a short-lived temp file used *only* to pass a request body to `az rest --body @file` (as the shared reference files do) — written immediately before the call and deleted immediately after with `Remove-Item`; it never captures or reads back output. Concrete violations seen in testing that are FORBIDDEN: `atk provision ... > atk_prov_out.txt`, `az ad app show ... > appverify.json`, plus `sso-step*.ps1`, `sso-*.log`, `sso-*.txt`, `sso-state.json`, `*-precheck.txt`, `server-sso.*.log`, `server-pid.txt`. The ONLY files this skill writes are the ones explicitly shown in its phases (`auth.ts`, edits to `mcpPlugin.json` / `declarativeAgent.json` / `env/.env.local` / `m365agents.local.yml` / `m365agents.yml` / the MCP server entry file). Do NOT delete or alter the ui-widget skill's own files (`tunnel.log`, `server.log`, `pids.txt`, etc.).
> - **TERMINAL OUTPUT LAGS? DO NOT REDIRECT TO A FILE.** If the terminal renders "one step behind", capture the output into a variable in the SAME shell and print it — no file: `$out = az ad app show --id $ClientId 2>&1 | Out-String; $out`. For `atk provision`, do NOT scrape stdout at all — read the generated values straight from `env/.env.local` (Phase 4d). Re-running a read-only query (`az ... show`) is always safe. Inventing a file to work around lag is never acceptable.
> - **TERMINAL RULES**: Background/separate terminals get a fresh shell with NO inherited variables. Use **literal values** (e.g., `devtunnel host myapp-tunnel`) in those terminals. Never put short timeouts on `az` commands.

> **🔀 SHELL-NEUTRAL (cross-platform).** All JSON / file / HTTP data operations run through small **Node** helpers shipped in this skill's [`scripts/`](scripts/) folder — no PowerShell-only cmdlets, no `jq`. They behave identically on Windows (PowerShell), macOS, and Linux (bash/zsh). **Before Phase 0**, set a variable to the absolute path of this skill's `scripts/` directory:
> - PowerShell: `$SsoScripts = "<abs path to this skill>/scripts"`
> - bash/zsh: `SsoScripts="<abs path to this skill>/scripts"`
>
> Then call helpers as `node "$SsoScripts/<name>.mjs" ...` — the `$SsoScripts` reference expands in every shell. Helpers print `KEY=value` lines; read those back into your variables. The ONLY shell-specific syntax left is trivial variable **assignment/capture** (`$X = ...` in PowerShell vs `X=$(...)` in bash) and the **Windows-only** PATH refresh in Phase 1 — use your shell's form and skip the PATH refresh on macOS/Linux.

> **FORMATTING RULES (align with `ui-widget-developer`):**
> - When you need a decision or input from the user, ask it with the **`AskUserQuestion`** tool — one structured question at a time — exactly as `ui-widget-developer` does. Do NOT bury questions in prose.
> - Render every **"Tell the user"** note as a markdown blockquote (`>` prefix); do NOT flatten it into a paragraph.

## Scope Guardrails

- **SSO only**: Entra app registration + ATK OAuth registration + `mcpPlugin.json` auth wiring + minimal token validation + sideload.
- **No OBO**: do NOT add downstream delegated token exchange / Microsoft Graph calls.
- **Minimal touch**: do NOT refactor the widget or rewrite the MCP server to express. Only add a small JWKS guard + a per-request claims store.
- **One tunnel**: REUSE the tunnel `ui-widget-developer` already created. Never create a second tunnel on the same port.

---

## ⛔ Phase 0 — Workspace Check (MANDATORY FIRST STEP)

This skill expects a project produced by `ui-widget-developer`. Detect that layout with the helper (run from the project root):

```
node "$SsoScripts/detect-project.mjs"
```

It prints:
```
APP_PACKAGE_DIR=<appPackage|DeclarativeAgent|empty>
HAS_ATK=<true|false>
HAS_MCP_PLUGIN=<true|false>
HAS_AI_PLUGIN=<true|false>
MCP_SERVER_DIR=<mcp-server|server|.|empty>
OK=<true|false>
```

Capture `APP_PACKAGE_DIR` → `$AppPackageDir` and `MCP_SERVER_DIR` → `$McpServerDir` for later phases. If `OK=false`, STOP:
- If `HAS_AI_PLUGIN=true` and `HAS_MCP_PLUGIN=false`, the project uses `ai-plugin.json` (express-jwt) — this skill is for the `mcpPlugin.json` (OAI Apps) layout only.
- Otherwise it isn't a ui-widget-developer project. Build the agent first with the ui-widget-developer skill (OAI Apps path), then re-run this skill.

**Tell the user:**
> **Detected your ui-widget agent.** I'll add Entra SSO without touching your widget code — register an Entra app, reuse your existing dev tunnel, add a small token-validation guard to your MCP server, wire the auth into `mcpPlugin.json`, then sideload and verify. No OBO.

---

## Phase 1 — Prerequisites (EXECUTE)

> **Windows only** — refresh PATH in the current PowerShell session (skip on macOS/Linux):
```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

| Tool | Check | Auto-install |
|------|-------|--------------|
| Azure CLI | `az version` | `winget install Microsoft.AzureCLI` |
| ATK CLI (>=1.1.8) | `atk --version` | `npm install -g @microsoft/m365agentstoolkit-cli` |
| Dev Tunnel CLI | `devtunnel --version` | `winget install Microsoft.devtunnel` |
| Node.js (>=20) | `node --version` | `winget install OpenJS.NodeJS.LTS` |

After installing any tool, refresh PATH with the snippet above. Tag CLI usage once: `$env:ATK_CLI_SKILL = "true"`.

---

## Phase 2 — Gather Inputs + Reuse Existing Tunnel (EXECUTE)

### 2a. App display name (for the Entra app)

```
node "$SsoScripts/app-name.mjs" "$AppPackageDir"
```

It prints `APP_DISPLAY_NAME=<base>-<alias>-<suffix>` (base derived from `manifest.json`.name.short or `declarativeAgent.json`.name, ATK `${{...}}` tokens stripped). Capture it → `$AppDisplayName`.

### 2b. Read the EXISTING tunnel + port from `env/.env.local` (DO NOT create a new tunnel)

```
node "$SsoScripts/env-tool.mjs" get "env/.env.local" MCP_SERVER_URL MCP_SERVER_DOMAIN DEVTUNNEL_NAME DEVTUNNEL_PORT
```

Capture the values: `MCP_SERVER_URL` → `$BaseUrl`, `MCP_SERVER_DOMAIN` → `$TunnelHost` (if empty, derive from `$BaseUrl` by stripping `https://` and any path), `DEVTUNNEL_NAME` → `$TunnelName`, `DEVTUNNEL_PORT` → `$Port` (default `3001` if empty). Set `$BackendIsLocal = true`.

- If `$BaseUrl` is non-empty: **reuse** that tunnel — do NOT create a new one.
- If `$BaseUrl` is empty: the ui-widget devtunnel likely isn't running. Tell the user to start it (`npm run tunnel` / `tunnel:win`) then re-run; only fall back to `references/dev-tunnel.md` if they choose to proceed.

> **If `$BaseUrl` is still empty after this step**, read and execute `references/dev-tunnel.md` to create ONE tunnel on `$Port`, then capture `$TunnelName`, `$BaseUrl`, `$TunnelHost`. Otherwise SKIP tunnel creation entirely — the tunnel is already running.

---

## Phase 3 — Step 1: Create the Entra ID App (EXECUTE)

Read and execute **every step** in `references/entra-app-registration.md`.

After completion you MUST have: `$ClientId`, `$ObjectId`, `$TenantId`.

---

## Phase 4 — Step 2: ATK OAuth Registration (MicrosoftEntra), env = `local` (EXECUTE)

> ui-widget projects provision with **`--env local`** and keep variables in `env/.env.local`. Use that env throughout (NOT `dev`).

### 4a. Ensure the `oauth/register` action exists in the ATK yml:

> **`--env local` runs the LOCAL lifecycle file.** ATK executes `m365agents.local.yml` (not `m365agents.yml`) for `--env local`. The `oauth/register` action MUST be injected into the `.local.yml`, or provision will silently skip it — you'll see the run execute only a handful of steps and **no `MCP_DA_OAUTH_*` keys** get written to `env/.env.local`. Always target the `.local.yml` when it exists.

Pick the lifecycle file (prefer the LOCAL one): first existing of `m365agents.local.yml` → `teamsapp.local.yml` → `m365agents.yml` → `teamsapp.yml`. Capture it → `$ymlPath`. Then ensure the `oauth/register` action exists:

```
node "$SsoScripts/inject-oauth-yml.mjs" "$ymlPath"
```

It prints `AUTH_ID_KEY=...`, `APP_ID_URI_KEY=...`, `INJECTED=true|false`. Capture `AUTH_ID_KEY` → `$authIdKey` and `APP_ID_URI_KEY` → `$appIdUriKey`. If the action was missing, the helper injects it (`oauth/register`, MicrosoftEntra) — before the `teamsApp/zipAppPackage` action in a main yml, or as the FIRST action under the `provision:` stage in a `.local.yml`. If it was already present, the existing env-var key names are returned.

### 4b. Pre-seed env vars in `env/.env.local` (reuse our az-created app; keep the existing tunnel URL):

```
node "$SsoScripts/env-tool.mjs" set "env/.env.local" "AAD_APP_CLIENT_ID=$ClientId" "$authIdKey=" "$appIdUriKey="
node "$SsoScripts/env-tool.mjs" setdefault "env/.env.local" "TEAMS_APP_ID="
```

This writes `AAD_APP_CLIENT_ID` and leaves the two oauth keys empty (ATK's provision fills them). `setdefault` only adds `TEAMS_APP_ID=` if it's not already present, so an existing value is never clobbered.

### 4c. Ensure ATK login, then provision:

Ensure ATK is logged in — run `atk auth list`; if no `microsoft.com` account is listed, run `atk auth login m365`. Then provision:
```
atk provision --env local --interactive false
```

### 4d. Read the generated Auth ID + Application ID URI:

```
node "$SsoScripts/env-tool.mjs" get "env/.env.local" "$authIdKey" "$appIdUriKey"
```

Capture the `$authIdKey` value → `$AuthId` and the `$appIdUriKey` value → `$AppIdUri`. If EITHER is empty, ATK did not emit them — re-run `atk provision --env local --interactive false` and check `env/.env.local` before continuing. Do NOT proceed without both.

---

## Phase 5 — Step 3: Update the Entra ID App (EXECUTE)

Read and execute **every step** in `references/entra-app-update.md` using `$AppIdUri`.
This sets the Application ID URI, exposes `access_as_user`, pre-authorizes M365 Copilot, adds `User.Read`, and submits admin consent (see `references/admin-consent.md`).

After completion you MUST have `$ScopeId` set and the app verified.

---

## Phase 6 — Wire SSO into `mcpPlugin.json` (EXECUTE)

The ui-widget runtime ships with `auth: { "type": "None" }`. Switch it to the SSO registration with the shipped helper:

```
node "$SsoScripts/patch-mcpplugin.mjs" "$AppPackageDir/mcpPlugin.json" "$AuthId"
```

This sets the `RemoteMCPServer` runtime's `auth` to `{ type: "OAuthPluginVault", reference_id: <AuthId> }`.

> Do NOT hardcode the tunnel URL into `spec.url`. The helper leaves the `${{MCP_SERVER_URL}}/mcp` placeholder intact; ATK fills it from `env/.env.local` (the value the ui-widget tunnel script wrote).

---

## Phase 6b — Add SSO-aware Conversation Starters (CONDITIONAL — EXECUTE)

> **Only add identity starters when the agent has NONE of its own.** SSO in this skill is a guard that wraps *every* tool — so any of the widget's own starters (e.g., "Weather in Seattle") already proves SSO the moment its tool call returns `200 OK` (the token was validated first) and the `[auth] Valid SSO token accepted` line prints in the server terminal. Do NOT clobber the widget's tool-matched starters with generic "Show my profile" ones that no widget tool can answer. Add the two identity starters ONLY as a fallback when the widget defined no starters, so a fresh agent still has something to click. The real proof is the guard + the `[auth]` log, not the starter text.

```
node "$SsoScripts/add-starters.mjs" "$AppPackageDir/declarativeAgent.json"
```

The helper prints one of:
- `KEPT=<n>` — the widget already defines starters; leave them intact (they exercise the SSO-guarded tool, so SSO proof = the `[auth]` log + a `200 OK` tool call).
- `ADDED=2` — no existing starters, so two identity starters were added as an SSO-proof fallback.
- `SKIPPED` — no `declarativeAgent.json` found; nothing to do.

> **Note on provisioning:** if a later `atk provision` regenerates `declarativeAgent.json` from the widget template, the widget's own starters win — which is fine, because they still flow through the SSO guard. Regardless of starters, the authoritative SSO proof is the `[auth] Valid SSO token accepted: { sid, aud, tid, iss }` line in the MCP server terminal (keep that window open) plus the `200 OK` on the tool call in Copilot's Agent debug info.

---

## Phase 7 — Inject Minimal JWKS Guard into the MCP Server (EXECUTE — Option A, no express)

> Minimal-touch: add ONE new file + a few lines in the existing server. Do NOT convert to express.

### 7a. Add `jose` to the MCP server deps + write the auth helper:

The `jose` dependency and the guard file are added with the shipped helper (idempotent — re-running is safe):

```
npm --prefix "$McpServerDir" install jose@^5 --save
node "$SsoScripts/write-auth-ts.mjs" "$McpServerDir/src/auth.ts"
```

> The helper writes the exact guard shown in [`scripts/templates/auth.ts.tmpl`](scripts/templates/auth.ts.tmpl) — a lazy-config JWKS validator that accepts every audience form Entra may emit (bare client-id GUID, `api://<clientId>`, and the ATK App ID URI; see `references/sso-explained.md` §3.2). If the server has no `src/` folder, write to `$McpServerDir/auth.ts` instead and adjust the import path in 7b accordingly.

### 7b. Insert the guard into the existing `/mcp` POST handler:

> Open the MCP server entry file (`$McpServerDir/src/index.ts` or equivalent). Find the branch that handles `POST /mcp` (look for `url.pathname === "/mcp"` and `req.method === "POST"`). Insert the guard as the FIRST statements inside that branch, and wrap the existing handling in `claimsStore.run(...)`.

Add the import near the top of the file:
```typescript
import { validateBearerToken, claimsStore } from "./auth.js";
```

Then transform the POST `/mcp` branch from:
```typescript
if (req.method === "POST" && url.pathname === "/mcp") {
  let body = "";
  for await (const chunk of req) body += chunk;
  const parsedBody = JSON.parse(body);
  await handleMcpRequest(req, res, parsedBody);
  return;
}
```
into (guard first, then run the original logic inside the claims scope):
```typescript
if (req.method === "POST" && url.pathname === "/mcp") {
  let claims;
  try {
    claims = await validateBearerToken(req.headers.authorization);
  } catch (err) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Authentication failed: " + (err as Error).message },
      id: null,
    }));
    return;
  }
  console.log("[auth] Valid SSO token accepted:", { sid: claims.sid, aud: claims.aud, tid: claims.tid, iss: claims.iss });
  await claimsStore.run(claims, async () => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const parsedBody = JSON.parse(body);
    await handleMcpRequest(req, res, parsedBody);
  });
  return;
}
```

> Tools can read the signed-in user's claims anywhere via `claimsStore.getStore()` (e.g., `name`, `preferred_username`, `oid`, `tid`). This proves SSO works without OBO.

### 7c. Allow the `Authorization` header through CORS:

> In the same file, find where `Access-Control-Allow-Headers` is set for `/mcp` (preflight + responses) and ADD `Authorization` to the list (e.g., `"Content-Type, mcp-session-id, Last-Event-ID, mcp-protocol-version, Authorization"`). Without this, browser-originated preflights would drop the token.

---

## Phase 8 — Write SSO env for the server (EXECUTE)

The ui-widget server already loads `env/.env.local` via dotenv, so write the three SSO values there with the shipped helper:

```
node "$SsoScripts/env-tool.mjs" set "env/.env.local" "TENANT_ID=$TenantId" "CLIENT_ID=$ClientId" "APP_ID_URI=$AppIdUri"
```

> If the MCP server loads a DIFFERENT env file (check its `dotenv.config({ path: ... })`), write these three keys into THAT file instead.

---

## Phase 9 — Build, Re-provision, Validate, Sideload (EXECUTE)

Build the server with the new guard (cross-platform — no `Push-Location` needed):
```
npm --prefix "$McpServerDir" install
npm --prefix "$McpServerDir" run build
```
If the build fails, fix the TypeScript errors before continuing.

Rebuild the app package with the patched `mcpPlugin.json` auth, locate the zip, then validate + sideload:
```
atk provision --env local --interactive false
node "$SsoScripts/find-zip.mjs" "$AppPackageDir"
```
Capture `ZIP_PATH` → `$zipPath` (prefers `$AppPackageDir/build/appPackage.zip`, else the first `appPackage*.zip`), then:
```
atk validate --package-file "$zipPath"
atk install --file-path "$zipPath"
```

---

## Phase 10 — Start + Verify 401 (EXECUTE)

> The tunnel is already running (ui-widget started it). Start the server in a SEPARATE terminal, then verify the guard rejects unauthenticated calls.

Start the server (separate terminal, literal path):
```
node dist/index.js
```

Verify an unauthenticated `/mcp` POST returns 401:
```
node "$SsoScripts/check-401.mjs" "http://localhost:$Port/mcp"
```

Expect `VERIFIED: 401 Unauthorized — SSO guard working`. If you see `WARNING: Got 200`, the Phase 7 guard isn't wired into the `/mcp` POST branch — recheck that insertion.

---

## Phase 11 — Clean Up SSO Scratch Only (EXECUTE)

> Remove only transient files THIS SSO flow could have produced. **Do NOT touch the ui-widget background-process files** (`tunnel.log`, `tunnel-err.log`, `server.log`, `server-err.log`, `pids.txt`) — those belong to the `ui-widget-developer` skill and must stay. Never delete source, config, env, or build outputs.

```
node "$SsoScripts/cleanup.mjs"
```

This removes only transient SSO scratch (`sso-*.log` / `.txt` / `.ps1`, `server-sso.*.log`, `server-pid.txt`, `sso-state.json`) from the project root and leaves the ui-widget logs (`tunnel.log` / `server.log` / `pids.txt`) intact.

> Tip for the repo: add `sso-*.ps1`, `sso-*.txt`, `sso-*.json`, `server-sso.*.log`, `server-pid.txt` to `.gitignore` so SSO transient files can never be committed.

---

## 🎉 FINAL SUMMARY (render DIRECTLY in your reply — NOT inside a code fence)

> Output the following structure as plain markdown in your chat reply. Do NOT wrap it in ``` ``` fences. Fill every `<placeholder>` with the actual value gathered during the run; mark unknowns `N/A`. Use **bold-label bullets** (shown below) — do NOT convert to a markdown table, since some chat surfaces render tables inconsistently.

# 🎉 ✅ SSO Setup Complete — ui-widget agent

## What changed (minimal-touch, no OBO)
- Registered an Entra app and ATK OAuth (MicrosoftEntra) configuration.
- Reused the EXISTING dev tunnel — no second tunnel created.
- Added a JWKS bearer-token guard to the MCP server (new `auth.ts` + a guard in the `/mcp` handler).
- Switched `mcpPlugin.json` runtime auth from `None` → `OAuthPluginVault`.
- Wrote `TENANT_ID` / `CLIENT_ID` / `APP_ID_URI` into `env/.env.local`.
- Re-provisioned, validated, and sideloaded the agent.

## App registration details
- **App display name:** `<AppDisplayName>`
- **Client ID:** `<ClientId>`
- **Object ID:** `<ObjectId>`
- **Tenant ID:** `<TenantId>`
- **Auth configuration ID (SSO):** `<AuthId>`
- **Application ID URI:** `<AppIdUri>`
- **Scope:** `<AppIdUri>/access_as_user`
- **Backend (reused tunnel):** `<BaseUrl>`
- **Tunnel name:** `<TunnelName>`
- **Local port:** `<Port>`

## Changed files
- `<AppPackageDir>/mcpPlugin.json` — runtime auth
- `<McpServerDir>/src/auth.ts` — new
- `<McpServerDir>/src/index.ts` — guard + CORS header + success-path log
- `<McpServerDir>/package.json` — `jose` dep
- `env/.env.local` — `TENANT_ID` / `CLIENT_ID` / `APP_ID_URI`
- `m365agents.yml` — `oauth/register`

## Test status
- **Build:** `<pass/fail>`
- **Validation:** `<pass/fail>`
- **Sideload/install:** `<pass/fail>`
- **Local 401 check:** `<result>`

## Test in Copilot
1. Open https://m365.cloud.microsoft/chat (agent may take up to 15 min to appear).
2. All agents → search `<AppDisplayName>`.
3. Ask something that triggers a widget tool.
4. Accept the one-time consent prompt.
5. Confirm the widget renders with your signed-in identity (claims like `name`/`oid` flow via the SSO token).
6. In the MCP server terminal, you should see one `[auth] Valid SSO token accepted: { sid, aud, tid, iss }` line per authenticated call — quick proof SSO is live.

---

## Notes & Error Handling

> **Concepts, behavior & failure modes** are documented in
> [`references/sso-explained.md`](references/sso-explained.md) — including the runtime token
> flow, the `aud`/`iss` validation rules, the `claimsStore` per-request identity pattern, a
> symptom→cause table, and how to extend to OBO / Microsoft Graph. Start there when
> debugging or when you need to understand *why* a phase does what it does.

- **Two tunnels?** This skill reuses the tunnel from `env/.env.local`. If you ever see a second tunnel, stop it and keep the named one the ui-widget script created.
- **401 in Copilot (not local):** server audience must equal `$AppIdUri` and issuer tenant `$TenantId` — confirm `env/.env.local` and that the server loads it. (See §5 of `sso-explained.md`.)
- **`mcpPlugin.json` vs `ai-plugin.json`:** this skill is specifically for the ui-widget `mcpPlugin.json` layout; `ai-plugin.json` (express-jwt) projects aren't supported here.
- **No OBO here.** For Microsoft Graph / downstream APIs, use a separate OBO flow later (out of scope). See §7 of `sso-explained.md` for what that delta looks like.
