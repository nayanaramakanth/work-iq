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

This skill expects a project produced by `ui-widget-developer`. Detect that layout:

```powershell
$AppPackageDir = if (Test-Path "appPackage/declarativeAgent.json") { "appPackage" }
                 elseif (Test-Path "DeclarativeAgent/declarativeAgent.json") { "DeclarativeAgent" }
                 else { $null }
$hasAtk         = (Test-Path "m365agents.yml") -or (Test-Path "teamsapp.yml")
$mcpPluginPath  = if ($AppPackageDir) { Join-Path $AppPackageDir "mcpPlugin.json" } else { $null }
$hasMcpPlugin   = $mcpPluginPath -and (Test-Path $mcpPluginPath)
$hasAiPlugin    = $AppPackageDir -and (Test-Path (Join-Path $AppPackageDir "ai-plugin.json"))

# Locate the MCP server folder (the dir that holds src/index.* and @modelcontextprotocol/sdk)
$McpServerDir = $null
foreach ($cand in @("mcp-server", "server", ".")) {
    $pkg = Join-Path $cand "package.json"
    if ((Test-Path $pkg)) {
        try {
            $p = Get-Content $pkg -Raw | ConvertFrom-Json
            $deps = @()
            if ($p.dependencies)    { $deps += $p.dependencies.PSObject.Properties.Name }
            if ($p.devDependencies) { $deps += $p.devDependencies.PSObject.Properties.Name }
            if ($deps -contains "@modelcontextprotocol/sdk") { $McpServerDir = $cand; break }
        } catch {}
    }
}

Write-Host "AppPackageDir=$AppPackageDir hasAtk=$hasAtk hasMcpPlugin=$hasMcpPlugin hasAiPlugin=$hasAiPlugin McpServerDir=$McpServerDir"

if (-not ($hasAtk -and $AppPackageDir -and $hasMcpPlugin -and $McpServerDir)) {
    Write-Host "ERROR: This does not look like a ui-widget-developer project." -ForegroundColor Red
    Write-Host "Expected: m365agents.yml + $AppPackageDir/mcpPlugin.json + an MCP server folder with @modelcontextprotocol/sdk." -ForegroundColor Red
    if ($hasAiPlugin -and -not $hasMcpPlugin) {
        Write-Host "Found ai-plugin.json instead of mcpPlugin.json — this skill is for the mcpPlugin.json (OAI Apps) layout." -ForegroundColor Yellow
    }
    Write-Host "Build the agent first with the ui-widget-developer skill (OAI Apps path), then re-run this skill." -ForegroundColor Yellow
    return
}
Write-Host "ui-widget-developer project detected ✅  (server: $McpServerDir)"
```

**Tell the user:**
> **Detected your ui-widget agent.** I'll add Entra SSO without touching your widget code — register an Entra app, reuse your existing dev tunnel, add a small token-validation guard to your MCP server, wire the auth into `mcpPlugin.json`, then sideload and verify. No OBO.

---

## Phase 1 — Prerequisites (EXECUTE)

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

```powershell
$BaseAppName = (Get-Content (Join-Path $AppPackageDir "manifest.json") -Raw | ConvertFrom-Json).name.short
if (-not $BaseAppName) { $BaseAppName = (Get-Content (Join-Path $AppPackageDir "declarativeAgent.json") -Raw | ConvertFrom-Json).name }
$BaseAppName = ($BaseAppName -replace '\$\{\{[^}]+\}\}','' -replace '[^A-Za-z0-9-]','')
if (-not $BaseAppName) { $BaseAppName = "uiwidget-agent" }
$userAlias = ($env:USERNAME); if (-not $userAlias) { $userAlias = "user" }
$userAlias = $userAlias.ToLower(); if ($userAlias -match '\\') { $userAlias = $userAlias.Split('\')[-1] }
$suffix = -join ((48..57)+(97..122) | Get-Random -Count 4 | ForEach-Object {[char]$_})
$AppDisplayName = "$BaseAppName-$userAlias-$suffix"
Write-Host "App: $AppDisplayName"
```

### 2b. Read the EXISTING tunnel + port from `env/.env.local` (DO NOT create a new tunnel)

```powershell
$envLocal = "env/.env.local"
$BaseUrl = $null; $TunnelHost = $null; $TunnelName = $null; $Port = 3001

if (Test-Path $envLocal) {
    $lines = Get-Content $envLocal
    $get = { param($k) (($lines | Where-Object { $_ -match "^$k=" }) -replace "^$k=","").Trim() }
    $existingUrl = & $get "MCP_SERVER_URL"
    $existingDom = & $get "MCP_SERVER_DOMAIN"
    $TunnelName  = & $get "DEVTUNNEL_NAME"
    $p           = & $get "DEVTUNNEL_PORT"
    if ($p) { $Port = [int]$p }
    if ($existingUrl) { $BaseUrl = $existingUrl; $TunnelHost = if ($existingDom) { $existingDom } else { $existingUrl -replace '^https?://','' -replace '/.*','' } }
}

if ($BaseUrl) {
    Write-Host "Reusing existing tunnel from env/.env.local → $BaseUrl (port $Port, name '$TunnelName') ✅"
    $BackendIsLocal = $true
} else {
    Write-Host "No MCP_SERVER_URL found in env/.env.local — the ui-widget devtunnel may not have been started yet." -ForegroundColor Yellow
    Write-Host "Start it first: in the project root run the ui-widget tunnel script (npm run tunnel / tunnel:win), then re-run this skill." -ForegroundColor Yellow
    Write-Host "Falling back to creating a tunnel via the shared reference (only if you proceed)." -ForegroundColor Yellow
    $BackendIsLocal = $true
}
```

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

```powershell
$ymlPath = if (Test-Path "m365agents.local.yml") { "m365agents.local.yml" }
           elseif (Test-Path "teamsapp.local.yml") { "teamsapp.local.yml" }
           elseif (Test-Path "m365agents.yml") { "m365agents.yml" }
           else { "teamsapp.yml" }
$yml = Get-Content $ymlPath -Raw

if ($yml -match 'oauth/register') {
    $authIdKey   = ([regex]::Match($yml, 'configurationId:\s*([A-Z0-9_]+)')).Groups[1].Value
    $appIdUriKey = ([regex]::Match($yml, 'applicationIdUri:\s*([A-Z0-9_]+)')).Groups[1].Value
}
if (-not $authIdKey)   { $authIdKey   = "MCP_DA_OAUTH_AUTH_ID" }
if (-not $appIdUriKey) { $appIdUriKey = "MCP_DA_OAUTH_APP_ID_URI" }

if ($yml -notmatch 'oauth/register') {
    $action = @'
  - uses: oauth/register
    with:
      name: daSso
      flow: authorizationCode
      appId: ${{TEAMS_APP_ID}}
      clientId: ${{AAD_APP_CLIENT_ID}}
      identityProvider: MicrosoftEntra
      baseUrl: ${{MCP_SERVER_URL}}
    writeToEnvironmentFile:
      configurationId: MCP_DA_OAUTH_AUTH_ID
      applicationIdUri: MCP_DA_OAUTH_APP_ID_URI

'@
    $marker = "- uses: teamsApp/zipAppPackage"
    $idx = $yml.IndexOf($marker)
    if ($idx -ge 0) {
        # Main yml shape — insert just before the zipAppPackage action
        $lineStart = $yml.LastIndexOf("`n", $idx) + 1
        $yml = $yml.Substring(0, $lineStart) + $action + $yml.Substring($lineStart)
    } elseif ($yml -match '(?m)^provision:\s*$') {
        # Local yml shape — insert as the FIRST action under the existing provision: stage
        $pidx = [regex]::Match($yml, '(?m)^provision:\s*$').Index
        $lineEnd = $yml.IndexOf("`n", $pidx) + 1
        $yml = $yml.Substring(0, $lineEnd) + $action + $yml.Substring($lineEnd)
    } else {
        # No provision stage yet — create one
        $yml = $yml.TrimEnd() + "`r`n`r`nprovision:`r`n" + $action
    }
    Set-Content $ymlPath -Value $yml -Encoding UTF8
    $authIdKey = "MCP_DA_OAUTH_AUTH_ID"; $appIdUriKey = "MCP_DA_OAUTH_APP_ID_URI"
    Write-Host "Injected oauth/register (MicrosoftEntra) into $ymlPath ✅"
}
Write-Host "Auth ID key: $authIdKey | API URI key: $appIdUriKey"
```

### 4b. Pre-seed env vars in `env/.env.local` (reuse our az-created app; keep the existing tunnel URL):

```powershell
if (-not (Test-Path "env")) { New-Item -ItemType Directory -Path "env" | Out-Null }
$envFile = "env/.env.local"
$content = if (Test-Path $envFile) { Get-Content $envFile } else { @() }

function Set-EnvLine([string[]]$lines, [string]$key, [string]$val) {
    if ($lines | Where-Object { $_ -match "^$key=" }) {
        return ($lines | ForEach-Object { if ($_ -match "^$key=") { "$key=$val" } else { $_ } })
    } else { return $lines + "$key=$val" }
}

$content = Set-EnvLine $content "AAD_APP_CLIENT_ID" $ClientId
$content = Set-EnvLine $content $authIdKey   ""        # filled by provision
$content = Set-EnvLine $content $appIdUriKey ""        # filled by provision
if (-not ($content | Where-Object { $_ -match "^TEAMS_APP_ID=" })) { $content += "TEAMS_APP_ID=" }
$content | Set-Content $envFile -Encoding UTF8
Write-Host "Pre-seeded env/.env.local (AAD_APP_CLIENT_ID + oauth keys) ✅"
```

### 4c. Ensure ATK login, then provision:

```powershell
if ((atk auth list 2>&1) -notmatch "microsoft.com") { atk auth login m365 }
atk provision --env local --interactive false
```

### 4d. Read the generated Auth ID + Application ID URI:

```powershell
$envLines = Get-Content "env/.env.local"
$AuthId   = (($envLines | Where-Object { $_ -match "^$authIdKey=" })   -replace "^$authIdKey=","").Trim()
$AppIdUri = (($envLines | Where-Object { $_ -match "^$appIdUriKey=" }) -replace "^$appIdUriKey=","").Trim()
if ([string]::IsNullOrWhiteSpace($AuthId) -or [string]::IsNullOrWhiteSpace($AppIdUri)) {
    Write-Host "ERROR: ATK did not emit Auth ID / App ID URI. Re-run 'atk provision --env local --interactive false' and check env/.env.local." -ForegroundColor Red
    return
}
Write-Host "Auth ID: $AuthId ✅"
Write-Host "App ID URI: $AppIdUri ✅"
```

---

## Phase 5 — Step 3: Update the Entra ID App (EXECUTE)

Read and execute **every step** in `references/entra-app-update.md` using `$AppIdUri`.
This sets the Application ID URI, exposes `access_as_user`, pre-authorizes M365 Copilot, adds `User.Read`, and submits admin consent (see `references/admin-consent.md`).

After completion you MUST have `$ScopeId` set and the app verified.

---

## Phase 6 — Wire SSO into `mcpPlugin.json` (EXECUTE)

The ui-widget runtime ships with `auth: { "type": "None" }`. Switch it to the SSO registration.

```powershell
$mcp = Get-Content $mcpPluginPath -Raw | ConvertFrom-Json -Depth 30
foreach ($rt in $mcp.runtimes) {
    if ($rt.type -eq "RemoteMCPServer") {
        $rt.auth = [pscustomobject]@{ type = "OAuthPluginVault"; reference_id = $AuthId }
        # spec.url stays as the ${{MCP_SERVER_URL}}/mcp placeholder so ATK keeps resolving it from env/.env.local.
    }
}
$mcp | ConvertTo-Json -Depth 30 | Set-Content $mcpPluginPath -Encoding UTF8
Write-Host "mcpPlugin.json: runtime auth → OAuthPluginVault ($AuthId) ✅"
```

> Do NOT hardcode the tunnel URL into `spec.url`. Leave the `${{MCP_SERVER_URL}}/mcp` placeholder; ATK fills it from `env/.env.local` (the value the ui-widget tunnel script wrote).

---

## Phase 6b — Add SSO-aware Conversation Starters (CONDITIONAL — EXECUTE)

> **Only add identity starters when the agent has NONE of its own.** SSO in this skill is a guard that wraps *every* tool — so any of the widget's own starters (e.g., "Weather in Seattle") already proves SSO the moment its tool call returns `200 OK` (the token was validated first) and the `[auth] Valid SSO token accepted` line prints in the server terminal. Do NOT clobber the widget's tool-matched starters with generic "Show my profile" ones that no widget tool can answer. Add the two identity starters ONLY as a fallback when the widget defined no starters, so a fresh agent still has something to click. The real proof is the guard + the `[auth]` log, not the starter text.

```powershell
$daJsonPath = Join-Path $AppPackageDir "declarativeAgent.json"
if (Test-Path $daJsonPath) {
    $daJson = Get-Content $daJsonPath -Raw | ConvertFrom-Json
    $existing = @($daJson.conversation_starters)
    if ($existing.Count -gt 0) {
        Write-Host "Widget already defines $($existing.Count) conversation_starter(s) — leaving them intact (they exercise the SSO-guarded tool). SSO proof = [auth] log + 200 OK tool call. ✅"
    } else {
        $daJson | Add-Member -NotePropertyName conversation_starters -NotePropertyValue @(
            [pscustomobject]@{ title = "Show my profile"; text = "Show my profile" },
            [pscustomobject]@{ title = "Greet by name";   text = "Greet me by name" }
        ) -Force
        $daJson | ConvertTo-Json -Depth 10 | Set-Content $daJsonPath -Encoding UTF8
        Write-Host "No existing starters — added two identity starters as SSO proof fallback ✅"
    }
} else {
    Write-Host "WARNING: $daJsonPath not found; skipping conversation_starters update." -ForegroundColor Yellow
}
```

> **Note on provisioning:** if a later `atk provision` regenerates `declarativeAgent.json` from the widget template, the widget's own starters win — which is fine, because they still flow through the SSO guard. Regardless of starters, the authoritative SSO proof is the `[auth] Valid SSO token accepted: { sid, aud, tid, iss }` line in the MCP server terminal (keep that window open) plus the `200 OK` on the tool call in Copilot's Agent debug info.

---

## Phase 7 — Inject Minimal JWKS Guard into the MCP Server (EXECUTE — Option A, no express)

> Minimal-touch: add ONE new file + a few lines in the existing server. Do NOT convert to express.

### 7a. Add `jose` to the MCP server deps + write the auth helper:

```powershell
Push-Location $McpServerDir
try {
    # Add jose (modern, ESM-friendly JWT verify) if missing
    $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
    $hasJose = $pkg.dependencies -and ($pkg.dependencies.PSObject.Properties.Name -contains "jose")
    if (-not $hasJose) { npm install jose@^5 --save | Out-Null; Write-Host "Added jose ✅" }

    # Determine source dir (src) and extension
    $srcDir = if (Test-Path "src") { "src" } else { "." }
    $authPath = Join-Path $srcDir "auth.ts"

    $authTs = @'
// SSO bearer-token validation for the MCP server (minimal-touch, no express).
// Verifies the incoming Authorization: Bearer <token> against Entra JWKS and exposes
// the validated claims per-request via AsyncLocalStorage. No Graph call, no OBO.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { AsyncLocalStorage } from "node:async_hooks";

export const claimsStore = new AsyncLocalStorage<JWTPayload | null>();

// IMPORTANT: read env vars LAZILY (inside ensureConfig), NOT at module top-level.
// Under ESM, this module can be imported BEFORE the server loads dotenv, so a top-level
// `process.env.TENANT_ID` would capture `undefined` and permanently break JWKS/audience.
// Resolving config on first request avoids that import-ordering bug.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let audiences: string[] = [];
let issuers: string[] = [];

function ensureConfig(): void {
  if (jwks) return;
  const tenantId = process.env.TENANT_ID;
  const clientId = process.env.CLIENT_ID;
  const appIdUri = process.env.APP_ID_URI;
  if (!tenantId) throw new Error("TENANT_ID not configured");
  jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`));
  // Accept EVERY audience form Entra may emit for this app. A real Copilot SSO token's `aud`
  // is the BARE client-id GUID (NOT the api:// / App ID URI form), so it MUST be accepted —
  // otherwise valid tokens 401 and Copilot enters an endless sign-in/consent loop. Still safe:
  // the issuer is tenant-scoped and the token is minted only for this clientId.
  // See references/sso-explained.md §3.2.
  audiences = [clientId, `api://${clientId}`, appIdUri].filter(Boolean) as string[];
  issuers = [
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
    `https://sts.windows.net/${tenantId}/`,
  ];
}

export async function validateBearerToken(authHeader?: string): Promise<JWTPayload> {
  ensureConfig();
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    throw new Error("Missing or malformed Authorization header");
  }
  const token = authHeader.slice(authHeader.indexOf(" ") + 1).trim();
  const { payload } = await jwtVerify(token, jwks!, {
    audience: audiences,
    issuer: issuers,
    algorithms: ["RS256"],
  });
  return payload;
}
'@
    Set-Content -Path $authPath -Value $authTs -Encoding UTF8
    Write-Host "Wrote $authPath ✅"
} finally {
    Pop-Location
}
```

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

The ui-widget server already loads `env/.env.local` via dotenv, so write the audience there.

```powershell
$envFile = "env/.env.local"
$content = Get-Content $envFile
$content = Set-EnvLine $content "TENANT_ID"  $TenantId
$content = Set-EnvLine $content "CLIENT_ID"  $ClientId
$content = Set-EnvLine $content "APP_ID_URI" $AppIdUri
$content | Set-Content $envFile -Encoding UTF8
Write-Host "env/.env.local: TENANT_ID, CLIENT_ID, APP_ID_URI written ✅ (server audience = $AppIdUri)"
```

> If the MCP server loads a DIFFERENT env file (check its `dotenv.config({ path: ... })`), write these three keys into THAT file instead.

---

## Phase 9 — Build, Re-provision, Validate, Sideload (EXECUTE)

```powershell
# Build the server with the new guard
Push-Location $McpServerDir
try { npm install; npm run build; if ($LASTEXITCODE -ne 0) { Write-Host "Build failed — fix TS errors." -ForegroundColor Red; return } }
finally { Pop-Location }

# Rebuild the app package with the patched mcpPlugin.json auth + sideload
atk provision --env local --interactive false

$zipPath = if (Test-Path "$AppPackageDir/build/appPackage.zip") { "./$AppPackageDir/build/appPackage.zip" }
           else { (Get-ChildItem -Recurse -Filter "appPackage*.zip" | Select-Object -First 1).FullName }
atk validate --package-file $zipPath
atk install --file-path $zipPath
```

---

## Phase 10 — Start + Verify 401 (EXECUTE)

> The tunnel is already running (ui-widget started it). Start the server in a SEPARATE terminal, then verify the guard rejects unauthenticated calls.

Start the server (separate terminal, literal path):
```powershell
node dist/index.js
```

Verify an unauthenticated `/mcp` POST returns 401:
```powershell
try {
    $body = '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
    Invoke-WebRequest -Uri "http://localhost:$Port/mcp" -Method POST -ContentType "application/json" -Body $body | Out-Null
    Write-Host "WARNING: Got 200 — auth not enforced. Check Phase 7 insertion." -ForegroundColor Yellow
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 401) { Write-Host "VERIFIED: 401 Unauthorized — SSO guard working ✅" -ForegroundColor Green }
    else { Write-Host "Got HTTP $code" -ForegroundColor Yellow }
}
```

---

## Phase 11 — Clean Up SSO Scratch Only (EXECUTE)

> Remove only transient files THIS SSO flow could have produced. **Do NOT touch the ui-widget background-process files** (`tunnel.log`, `tunnel-err.log`, `server.log`, `server-err.log`, `pids.txt`) — those belong to the `ui-widget-developer` skill and must stay. Never delete source, config, env, or build outputs.

```powershell
# SSO-related scratch only (this skill shouldn't create these, but sweep defensively):
$scratch  = @("server-sso.out.log","server-sso.err.log","server-pid.txt","sso-state.json")
$patterns = @("sso-step*.ps1","sso-*.log","sso-*.txt","sso-precheck*","sso-provision*.log","sso-az.txt","sso-atkcheck.txt")
foreach ($f in $scratch)  { if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue } }
foreach ($p in $patterns) { Get-ChildItem -Path . -Filter $p -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue }
Write-Host "SSO scratch cleaned — ui-widget logs (tunnel.log/server.log/pids.txt) left intact ✅"
```

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
