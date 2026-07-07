# SSO Setup for ui-widget Agents (TypeScript)

Adds Entra SSO to a **Microsoft 365 Copilot declarative agent built with the `ui-widget-developer` skill** (OAI Apps path — `mcpPlugin.json` + a raw-http MCP server).

The skill drives every step from the terminal — Entra ID app registration, ATK SSO registration, `mcpPlugin.json` auth wiring, a minimal JWKS token guard, validation, and sideload — reusing your existing dev tunnel. SSO only — no OBO. Zero manual Azure Portal or Teams Developer Portal steps.

## Installation

### Via GitHub Copilot CLI Plugin Marketplace

```bash
/plugin install sso-setup-typescript@<repo>
```

### Local install (for testing)

Clone this repo and point Copilot CLI at the plugin folder, or copy the `skills/setup-sso-ui-widget/` directory into your project's `.github/skills/` folder.

## Usage

After building your agent with the `ui-widget-developer` skill, ask Copilot to add SSO:

```
# Add SSO to a ui-widget agent
"Add SSO to my ui-widget agent"
"Setup SSO for ui widget skill"
"Wire Entra auth for my ui widget MCP server"
"Configure only SSO, no OBO"
```

The skill reuses your running dev tunnel, answers a couple of questions, and does the rest automatically.

## Prerequisites

The skill checks (and offers to install) these on first run:

- **Azure CLI** — creates the Entra ID app registration
- **Dev Tunnel CLI** — exposes localhost to the internet
- **Node.js >= 20** — runs the TypeScript MCP server
- **ATK CLI >= 1.1.8** — registers SSO and packages the agent

## Project requirements

> **Important**: This skill expects an **existing ui-widget agent project** built with the `ui-widget-developer` skill (OAI Apps path). It does **not** scaffold the server code — it adds SSO on top of your existing widget + MCP server.

The skill is designed for projects that have all of the following:

- `appPackage/mcpPlugin.json` (the ui-widget MCP plugin manifest)
- A raw-http MCP server folder (e.g. `mcp-server/`) using `@modelcontextprotocol/sdk`
- `m365agents.yml` / `m365agents.local.yml` (ATK project)
- A **running dev tunnel** and `env/.env.local` (written by the ui-widget tunnel script)

If your project is missing any of the above, the skill exits with a clear error during its workspace check — it never tries to create the missing files for you.

### How to get a project that meets these requirements

Build the agent first with the [`ui-widget-developer`](https://github.com/microsoft/work-iq/tree/main/plugins/microsoft-365-agents-toolkit/skills/ui-widget-developer) skill (OAI Apps path), start its dev tunnel + MCP server, then run this skill on top.

## Skills

| Skill | What It Does |
|-------|-------------|
| [**setup-sso-ui-widget**](./skills/setup-sso-ui-widget/SKILL.md) | SSO for `ui-widget-developer` agents (OAI Apps): adapts to the `mcpPlugin.json` + `mcp-server/` layout, reuses the existing dev tunnel, injects a minimal JWKS guard (no express rewrite), wires `OAuthPluginVault`, sideloads, and prints app-registration details. SSO only — no OBO. |

## License

See the root `LICENSE` file.
