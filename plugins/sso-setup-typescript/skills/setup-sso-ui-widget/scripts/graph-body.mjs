// graph-body — build a Microsoft Graph PATCH body for an app-update op, write it to a
// short-lived temp file, and print ONLY that file's path. The skill then runs the visible
// `az rest --method PATCH ... --body @<path>` and deletes the file with rm.mjs.
// This replaces PowerShell's ConvertTo-Json + Set-Content temp-file dance (cross-platform).
//
// Usage:
//   node graph-body.mjs set-token-version
//   node graph-body.mjs add-scope <scopeId>
//   node graph-body.mjs preauth   <scopeId>
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// M365 Copilot is the ONLY client a Declarative Agent needs pre-authorized.
const M365_COPILOT_APP_ID = "ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b";

const [op, scopeId] = process.argv.slice(2);

function bodyFor(op, scopeId) {
  switch (op) {
    case "set-token-version":
      return { api: { requestedAccessTokenVersion: 2 } };
    case "add-scope":
      if (!scopeId) throw new Error("add-scope requires <scopeId>");
      return {
        api: {
          oauth2PermissionScopes: [
            {
              adminConsentDescription:
                "Allow the application to access the server on behalf of the signed-in user",
              adminConsentDisplayName: "Access as user",
              id: scopeId,
              isEnabled: true,
              type: "User",
              userConsentDescription:
                "Allow the application to access the server on your behalf",
              userConsentDisplayName: "Access as user",
              value: "access_as_user",
            },
          ],
        },
      };
    case "preauth":
      if (!scopeId) throw new Error("preauth requires <scopeId>");
      return {
        api: {
          preAuthorizedApplications: [
            { appId: M365_COPILOT_APP_ID, delegatedPermissionIds: [scopeId] },
          ],
        },
      };
    default:
      throw new Error(`unknown op: ${op}`);
  }
}

let body;
try {
  body = bodyFor(op, scopeId);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const file = join(tmpdir(), `sso-graph-${randomUUID()}.json`);
writeFileSync(file, JSON.stringify(body), "utf8");
console.log(file);
