# Entra ID App Registration — Step 3: Update the App

> **Tell the user:**
> **Finishing your app's identity.** ATK's `oauth/register` just generated the **Application ID URI** — the token audience M365 Copilot will mint tokens for. Now I'll stamp that URI onto the Entra app, expose the `access_as_user` scope, pre-authorize M365 Copilot, and request the `User.Read` permission.

> **Prerequisites from earlier phases:** `$ClientId`, `$ObjectId`, `$TenantId` (Step 1) and `$AppIdUri` (Step 2 — ATK `oauth/register` output). If `$AppIdUri` is empty, go back to Phase 5 and re-run `atk provision`.

---

## Step 1 — Set the Application ID URI (from ATK)

> **CRITICAL**: Use the URI ATK generated (`$AppIdUri`, e.g. `api://...`) — **not** `api://$ClientId`. The service-issued URI is the audience Copilot's SSO tokens will carry, so your backend must accept exactly this value.

First confirm `$AppIdUri` is non-empty — if it's empty, re-run Phase 5 (ATK OAuth registration) / `atk provision` before continuing. Then stamp it onto the app:
```
az ad app update --id "$ClientId" --identifier-uris "$AppIdUri"
```

### Set the accepted access token version to v2.0

> M365 Copilot SSO requires **v2.0** tokens. The app's `requestedAccessTokenVersion` (shown as `accessTokenAcceptedVersion` in the legacy manifest) must be `2`, otherwise Entra issues v1.0 tokens with a different `aud`/issuer shape and your backend validation will fail.

Build the PATCH body with the helper, apply it, then remove the temp body file:
```
node "$SsoScripts/graph-body.mjs" set-token-version
```
Capture the printed path → `$BodyFile`, then:
```
az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/$ObjectId" --headers "Content-Type=application/json" --body "@$BodyFile"
node "$SsoScripts/rm.mjs" "$BodyFile"
```
If the PATCH fails, STOP — the app would issue v1.0 tokens with a mismatched `aud`/issuer shape and your backend validation would fail.

> **Token validation — important:** Your backend must validate the **`aud` (audience)** claim of incoming SSO tokens. In practice a real M365 Copilot SSO token's `aud` is the **bare client-id GUID** — not the `api://` form and often not the ATK-generated `$AppIdUri` — so validate `aud` against **all** of `[<clientId GUID>, api://<clientId>, $AppIdUri]`. Accepting only `$AppIdUri` will reject valid tokens (401) and trigger an endless sign-in/consent loop. It stays secure because the issuer is tenant-scoped and the token is minted only for your app's clientId. Configure your JWT validation (e.g. express-jwt `audience` option as an array, or an `aud` check in API-plugin middleware) to accept all three forms.

## Step 2 — Add `access_as_user` Scope

Generate a scope ID → `$ScopeId`:
```
node "$SsoScripts/uuid.mjs"
```
Build the scope PATCH body, apply it, then clean up:
```
node "$SsoScripts/graph-body.mjs" add-scope "$ScopeId"
```
Capture the printed path → `$BodyFile`, then:
```
az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/$ObjectId" --headers "Content-Type=application/json" --body "@$BodyFile"
node "$SsoScripts/rm.mjs" "$BodyFile"
```

If the scope already exists (re-run), read its ID instead of generating a new one and capture it → `$ScopeId`:
```
az ad app show --id "$ClientId" --query "api.oauth2PermissionScopes[?value=='access_as_user'].id | [0]" -o tsv
```

## Step 3 — Pre-authorize M365 Copilot for the Scope

> For Declarative Agents, only the M365 Copilot client needs pre-authorization — it's the only app that requests tokens on behalf of users to call your agent. This applies identically to MCP and API-plugin agents.

Build the pre-authorization body (M365 Copilot only), apply it, then clean up:
```
node "$SsoScripts/graph-body.mjs" preauth "$ScopeId"
```
Capture the printed path → `$BodyFile`, then:
```
az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/$ObjectId" --headers "Content-Type=application/json" --body "@$BodyFile"
node "$SsoScripts/rm.mjs" "$BodyFile"
```

> **Note**: For a Declarative Agent, **M365 Copilot (`ab3be6b7-…`) is the only client that needs pre-authorization** — keep the list to this single entry. Do not add Teams/Office/Outlook client IDs; they are not required for a DA and only widen the app's trust surface.

## Step 4 — Add User.Read Permission (default)

List the Microsoft Graph delegated-permission IDs already on the app:
```
az ad app show --id "$ClientId" --query "requiredResourceAccess[?resourceAppId=='00000003-0000-0000-c000-000000000000'].resourceAccess[].id" -o tsv
```
If the output does NOT contain `e1fe6dd8-ba31-4d61-89e7-88639da4683d` (User.Read), add it:
```
az ad app permission add --id "$ClientId" --api 00000003-0000-0000-c000-000000000000 --api-permissions e1fe6dd8-ba31-4d61-89e7-88639da4683d=Scope
```

## Step 5 — Admin Consent

Read and follow [admin-consent.md](admin-consent.md) for the appropriate tenant-specific flow.

## Step 6 — Verify App Registration

```
az ad app show --id "$ClientId" --query "{name:displayName, appIdUri:identifierUris[0], tokenVersion:api.requestedAccessTokenVersion, redirectUris:web.redirectUris, scopes:api.oauth2PermissionScopes[].value, preAuthCount:length(api.preAuthorizedApplications), graphPerms:length(requiredResourceAccess)}" -o json
```

Expected: `appIdUri` = the ATK-generated URI (`$AppIdUri`), `tokenVersion` = `2`, scopes = `["access_as_user"]`, preAuthCount = `1` (M365 Copilot), graphPerms = `1`.

---

## Done — Step 3 complete

The Entra app is fully configured. Return to the main SKILL.md and continue with **Phase 7 (Config Patching)**.
