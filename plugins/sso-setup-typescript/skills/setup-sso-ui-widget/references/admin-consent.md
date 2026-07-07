# Admin Consent

This reference handles granting admin consent for the User.Read permission.

---

## Grant Admin Consent

**Tell the user:**

> **Granting Admin Consent**
>
> The CLI command below grants admin consent for the **User.Read** permission.
>
> **If you are the tenant administrator** (Global Admin or Privileged Role Admin): The command will succeed and consent is granted immediately. No further action needed.
>
> **If you are NOT a tenant admin**: The command will fail. You have two options:
> 1. Ask your tenant admin to grant consent via **Azure Portal** → **App registrations** → your app → **API permissions** → **Grant admin consent**
> 2. If your organization allows it, users can self-consent on first use (they'll see a one-time "Allow" prompt)
>
> Without admin consent, the SSO flow will show an extra "Allow" consent button instead of seamless sign-in — but it will still work.

### Execute:
```powershell
$consentResult = az ad app permission admin-consent --id $ClientId 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Admin consent granted successfully ✅" -ForegroundColor Green
} else {
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "Admin consent CLI command failed — you may not have admin privileges" -ForegroundColor Yellow
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  1. Ask your tenant admin to grant consent in Azure Portal" -ForegroundColor Yellow
    Write-Host "  2. Users will see a one-time consent prompt on first use" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
}
```

---

## Done

Return to the calling reference file ([entra-app-update.md](entra-app-update.md) Step 5) and continue with Step 6 (Verify).
