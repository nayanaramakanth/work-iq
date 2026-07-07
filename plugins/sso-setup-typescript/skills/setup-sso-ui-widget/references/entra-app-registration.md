# Entra ID App Registration — Step 1: Create the App

> **Tell the user:**
> **Creating your app's identity in Entra ID.** Every app that participates in SSO needs an identity — an app registration. This is how Entra ID knows your agent exists and who's allowed to request tokens for it.

> **Scope of this file:** This is **Step 1 — create only**. It does NOT set the Application ID URI, the `access_as_user` scope, or pre-authorization. Those happen in **Step 3** ([entra-app-update.md](entra-app-update.md)) after ATK's `oauth/register` generates the service-issued Application ID URI.

---

## Step 1 — Login to Azure

> **Tell the user FIRST (before running the command):**
> **🔐 If you're not already signed in, a browser window will pop up for Azure login. Please complete the sign-in there — I'll wait up to 2 minutes for it to finish, then continue automatically.** Do not re-run the step; just sign in once.

```powershell
# Probe with `az ad signed-in-user show` (Microsoft Graph call) instead of `az account show`.
# Why: `az account show` requires an ARM subscription context; Entra app registration only needs
# tenant/Graph context. The Graph probe is the correct "am I signed in for app-registration work?" check.
$signedIn = az ad signed-in-user show --only-show-errors 2>$null | ConvertFrom-Json
if (-not $signedIn) {
    Write-Host "Not signed in to Azure CLI — launching browser. Sign in in the popup; this step will resume automatically." -ForegroundColor Yellow
    # --allow-no-subscriptions: lets users without an active ARM subscription still sign in for Entra work.
    # Valid flag on `az login`; NOT valid on `az account show` (that's why we use the Graph probe above).
    az login --allow-no-subscriptions --only-show-errors | Out-Null
    $signedIn = az ad signed-in-user show --only-show-errors 2>$null | ConvertFrom-Json
}
if (-not $signedIn) {
    Write-Host "ERROR: Azure login failed. Please run 'az login' manually in this terminal and re-run the skill." -ForegroundColor Red
    return
}
# Tenant comes from the Microsoft Graph /organization endpoint — no subscription required.
$org = az rest --method GET --uri "https://graph.microsoft.com/v1.0/organization" --only-show-errors 2>$null | ConvertFrom-Json
$TenantId = $org.value[0].id
if (-not $TenantId) {
    Write-Host "ERROR: Could not determine tenant ID from Microsoft Graph. Verify Azure CLI login and Graph access, then re-run the skill." -ForegroundColor Red
    return
}
Write-Host "Logged in as: $($signedIn.userPrincipalName) | Tenant: $TenantId ✅"
```

## Step 2 — What This Step Will Do

> **Creating your app's identity in Entra ID (Azure AD).** In this step, I'll:
> 1. **Register the app** — gives it a unique Client ID
> 2. **Set the Copilot redirect URI** — tells Entra ID where to send the user after authentication
>
> The Application ID URI, `access_as_user` scope, and pre-authorization come **later** (Step 3), once ATK generates the URI.

## Step 3 — Single vs Multi-Tenant

The default is **single tenant** (`AzureADMyOrg`) — only users in your own org can sign in.

> **Use the ask-questions tool** to confirm:
> - Header: "Tenant audience"
> - Question: "Should this app be **single-tenant** (only your organization) or **multi-tenant** (users from any Microsoft Entra organization)? Single-tenant is the default and recommended unless you're shipping to external orgs."
> - Options: **"Single tenant (default)"** | **"Multi-tenant"**

```powershell
# Default single-tenant; set to multi-tenant only if the user chose it.
$SignInAudience = "AzureADMyOrg"          # single tenant
# If the user chose multi-tenant:
# $SignInAudience = "AzureADMultipleOrgs" # multi-tenant
Write-Host "Sign-in audience: $SignInAudience"
```

## Step 4 — Create App Registration

> ⛔ **CRITICAL**: You MUST run `az ad app create` below. Do NOT search for existing apps. Do NOT reuse any ClientId from a previous conversation.

```powershell
$appJson = az ad app create --display-name "$AppDisplayName" --sign-in-audience $SignInAudience 2>$null
$app = $appJson | ConvertFrom-Json
$ClientId = $app.appId
$ObjectId = $app.id
Write-Host "App created: $AppDisplayName | Client ID: $ClientId"
```

## Step 5 — Create Service Principal

```powershell
az ad sp create --id $ClientId 2>$null
Write-Host "Service principal created ✅"
```

## Step 6 — Set the Copilot Redirect URI

> The single redirect URI M365 Copilot's SSO flow uses is `oAuthConsentRedirect`. This matches ATK's `oauth/register` default redirect — no other redirect URIs are needed.

```powershell
az ad app update --id $ClientId --web-redirect-uris "https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect"
Write-Host "Redirect URI set ✅"
```

---

## Done — Step 1 complete

You now have: `$ClientId`, `$ObjectId`, `$TenantId`.

Return to the main SKILL.md and continue with **Phase 4 (Dev Tunnel)** then **Phase 5 (ATK OAuth Registration)**. The Application ID URI, scope, and pre-authorization are applied in **Step 3** ([entra-app-update.md](entra-app-update.md)) after ATK generates the URI.
