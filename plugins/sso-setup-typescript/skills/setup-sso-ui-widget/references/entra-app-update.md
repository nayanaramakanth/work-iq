# Entra ID App Registration — Step 3: Update the App

> **Tell the user:**
> **Finishing your app's identity.** ATK's `oauth/register` just generated the **Application ID URI** — the token audience M365 Copilot will mint tokens for. Now I'll stamp that URI onto the Entra app, expose the `access_as_user` scope, pre-authorize M365 Copilot, and request the `User.Read` permission.

> **Prerequisites from earlier phases:** `$ClientId`, `$ObjectId`, `$TenantId` (Step 1) and `$AppIdUri` (Step 2 — ATK `oauth/register` output). If `$AppIdUri` is empty, go back to Phase 5 and re-run `atk provision`.

---

## Step 1 — Set the Application ID URI (from ATK)

> **CRITICAL**: Use the URI ATK generated (`$AppIdUri`, e.g. `api://...`) — **not** `api://$ClientId`. The service-issued URI is the audience Copilot's SSO tokens will carry, so your backend must accept exactly this value.

```powershell
if ([string]::IsNullOrWhiteSpace($AppIdUri)) {
    Write-Host "ERROR: `$AppIdUri is empty. Re-run Phase 5 (ATK OAuth registration) before Step 3." -ForegroundColor Red
    return
}
az ad app update --id $ClientId --identifier-uris "$AppIdUri"
Write-Host "Application ID URI set → $AppIdUri ✅"
```

### Set the accepted access token version to v2.0

> M365 Copilot SSO requires **v2.0** tokens. The app's `requestedAccessTokenVersion` (shown as `accessTokenAcceptedVersion` in the legacy manifest) must be `2`, otherwise Entra issues v1.0 tokens with a different `aud`/issuer shape and your backend validation will fail.

```powershell
$tokenVersionBody = @{ api = @{ requestedAccessTokenVersion = 2 } } | ConvertTo-Json -Depth 5 -Compress

$bodyFile = [System.IO.Path]::GetTempFileName()
$tokenVersionBody | Set-Content -Path $bodyFile -Encoding UTF8

$patchResult = az rest --method PATCH `
    --uri "https://graph.microsoft.com/v1.0/applications/$ObjectId" `
    --headers "Content-Type=application/json" `
    --body "@$bodyFile" 2>&1

Remove-Item $bodyFile -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to set requestedAccessTokenVersion=2. Graph/tenant policy may have blocked the PATCH:" -ForegroundColor Red
    Write-Host $patchResult -ForegroundColor Red
    throw "Set access token version failed — do not continue; the app would issue v1.0 tokens."
}
Write-Host "Access token version set → v2.0 ✅"
```

> **Token validation — important:** Your backend must validate the **`aud` (audience)** claim of incoming SSO tokens. In practice a real M365 Copilot SSO token's `aud` is the **bare client-id GUID** — not the `api://` form and often not the ATK-generated `$AppIdUri` — so validate `aud` against **all** of `[<clientId GUID>, api://<clientId>, $AppIdUri]`. Accepting only `$AppIdUri` will reject valid tokens (401) and trigger an endless sign-in/consent loop. It stays secure because the issuer is tenant-scoped and the token is minted only for your app's clientId. Configure your JWT validation (e.g. express-jwt `audience` option as an array, or an `aud` check in API-plugin middleware) to accept all three forms.

## Step 2 — Add `access_as_user` Scope

```powershell
$ScopeId = [guid]::NewGuid().ToString()

$apiBody = @{
    api = @{
        oauth2PermissionScopes = @(
            @{
                adminConsentDescription = "Allow the application to access the server on behalf of the signed-in user"
                adminConsentDisplayName = "Access as user"
                id                      = $ScopeId
                isEnabled               = $true
                type                    = "User"
                userConsentDescription  = "Allow the application to access the server on your behalf"
                userConsentDisplayName  = "Access as user"
                value                   = "access_as_user"
            }
        )
    }
} | ConvertTo-Json -Depth 5 -Compress

$bodyFile = [System.IO.Path]::GetTempFileName()
$apiBody | Set-Content -Path $bodyFile -Encoding UTF8

$patchResult = az rest --method PATCH `
    --uri "https://graph.microsoft.com/v1.0/applications/$ObjectId" `
    --headers "Content-Type=application/json" `
    --body "@$bodyFile" 2>&1

Remove-Item $bodyFile -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to add the access_as_user scope. Check the az output below:" -ForegroundColor Red
    Write-Host $patchResult -ForegroundColor Red
    throw "Add access_as_user scope failed — do not continue."
}
Write-Host "Scope: access_as_user ✅"
```

If the scope already exists (re-run), read its ID instead:
```powershell
$existingApp = az ad app show --id $ClientId 2>$null | ConvertFrom-Json
$existingScope = $existingApp.api.oauth2PermissionScopes | Where-Object { $_.value -eq "access_as_user" }
if ($existingScope) { $ScopeId = $existingScope.id }
```

## Step 3 — Pre-authorize M365 Copilot for the Scope

> For Declarative Agents, only the M365 Copilot client needs pre-authorization — it's the only app that requests tokens on behalf of users to call your agent. This applies identically to MCP and API-plugin agents.

```powershell
$PreAuthorizedClients = @(
    "ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b"   # M365 Copilot
)

$preAuthApps = $PreAuthorizedClients | ForEach-Object {
    @{ appId = $_; delegatedPermissionIds = @($ScopeId) }
}

$preAuthBody = @{
    api = @{
        preAuthorizedApplications = $preAuthApps
    }
} | ConvertTo-Json -Depth 5 -Compress

$bodyFile = [System.IO.Path]::GetTempFileName()
$preAuthBody | Set-Content -Path $bodyFile -Encoding UTF8

$patchResult = az rest --method PATCH `
    --uri "https://graph.microsoft.com/v1.0/applications/$ObjectId" `
    --headers "Content-Type=application/json" `
    --body "@$bodyFile" 2>&1

Remove-Item $bodyFile -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to pre-authorize the M365 Copilot client. Check the az output below:" -ForegroundColor Red
    Write-Host $patchResult -ForegroundColor Red
    throw "Pre-authorize M365 Copilot failed — do not continue."
}
Write-Host "Pre-authorized M365 Copilot client ✅"
```

> **Note**: For a Declarative Agent, **M365 Copilot (`ab3be6b7-…`) is the only client that needs pre-authorization** — keep the list to this single entry. Do not add Teams/Office/Outlook client IDs; they are not required for a DA and only widen the app's trust surface.

## Step 4 — Add User.Read Permission (default)

```powershell
$existingPerms = az ad app show --id $ClientId --query "requiredResourceAccess" -o json 2>$null | ConvertFrom-Json
$hasUserRead = $existingPerms | Where-Object { $_.resourceAccess | Where-Object { $_.id -eq "e1fe6dd8-ba31-4d61-89e7-88639da4683d" } }
if (-not $hasUserRead) {
    az ad app permission add --id $ClientId --api 00000003-0000-0000-c000-000000000000 --api-permissions e1fe6dd8-ba31-4d61-89e7-88639da4683d=Scope
    Write-Host "User.Read permission added"
} else {
    Write-Host "User.Read already present — skipping"
}
```

## Step 5 — Admin Consent

Read and follow [admin-consent.md](admin-consent.md) for the appropriate tenant-specific flow.

## Step 6 — Verify App Registration

```powershell
az ad app show --id $ClientId --query "{name:displayName, appIdUri:identifierUris[0], tokenVersion:api.requestedAccessTokenVersion, redirectUris:web.redirectUris, scopes:api.oauth2PermissionScopes[].value, preAuthCount:length(api.preAuthorizedApplications), graphPerms:length(requiredResourceAccess)}" -o json
```

Expected: `appIdUri` = the ATK-generated URI (`$AppIdUri`), `tokenVersion` = `2`, scopes = `["access_as_user"]`, preAuthCount = `1` (M365 Copilot), graphPerms = `1`.

---

## Done — Step 3 complete

The Entra app is fully configured. Return to the main SKILL.md and continue with **Phase 7 (Config Patching)**.
