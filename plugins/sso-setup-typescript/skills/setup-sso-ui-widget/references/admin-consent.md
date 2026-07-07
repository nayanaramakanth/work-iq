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
```
az ad app permission admin-consent --id "$ClientId"
```
If the command succeeds, admin consent is granted. If it fails (you are not a tenant admin), either ask your tenant admin to grant consent in the Azure Portal (**App registrations** → your app → **API permissions** → **Grant admin consent**), or rely on the one-time user consent prompt on first use.

---

## Done

Return to the calling reference file ([entra-app-update.md](entra-app-update.md) Step 5) and continue with Step 6 (Verify).
