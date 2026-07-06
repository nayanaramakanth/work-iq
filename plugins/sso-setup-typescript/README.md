# SSO Setup (TypeScript)

Automates end-to-end SSO setup for **TypeScript MCP server declarative agent** projects targeting Microsoft 365 Copilot.

The skill drives every step from the terminal — Entra ID app registration, dev tunnel creation, ATK SSO registration, config patching, validation, and sideload — with zero manual Azure Portal or Teams Developer Portal steps.

## Installation

### Via GitHub Copilot CLI Plugin Marketplace

```bash
/plugin install sso-setup-typescript@<repo>
```

### Local install (for testing)

Clone this repo and point Copilot CLI at the plugin folder, or copy the `skills/setup-sso/` directory into your project's `.github/skills/` folder.

## Usage

After installation, ask Copilot to run SSO setup against your TypeScript MCP server declarative agent project:

```
# Run end-to-end SSO setup
"Set up SSO for my agent"
"Configure SSO authentication for this MCP server"
"Register an Entra app and wire up SSO"
```

The skill answers 1–2 questions and does the rest automatically.

## Prerequisites

The skill checks (and offers to install) these on first run:

- **Azure CLI** — creates the Entra ID app registration
- **Dev Tunnel CLI** — exposes localhost to the internet
- **Node.js >= 20** — runs the TypeScript MCP server
- **ATK CLI >= 1.1.8** — registers SSO and packages the agent

## Project requirements

> **Important**: This skill expects an **existing TypeScript MCP server declarative agent project**. It does **not** scaffold the server code itself — `atk new` only scaffolds the agent shell (`appPackage/`, `m365agents.yml`); it does not generate a Node/Express MCP server.

The skill is designed for projects that have all of the following:

- `package.json` with an `express-jwt` dependency
- `tsconfig.json` or `src/index.ts` (TypeScript)
- `m365agents.yml` (ATK project)
- An MCP server in `src/` using `express` + `express-jwt` + `jwks-rsa` for token validation
- An `appPackage/` (or `DeclarativeAgent/`) folder containing `declarativeAgent.json`, `manifest.json`, and `ai-plugin.json`

If your project is missing any of the above, the skill exits with a clear error during its workspace check — it never tries to create the missing files for you.

### How to get a project that meets these requirements

You have two options:

1. **Use an internal generator** (Microsoft IT): the `MyProfileMCP_SSO_TypeScript_Template` from the AgentTemplatesHub produces a project that already meets every requirement above. Generate the project, then run this skill on top.
2. **Hand-roll**: scaffold the agent shell with the [`declarative-agent-developer`](https://github.com/microsoft/work-iq/tree/main/plugins/microsoft-365-agents-toolkit/skills/declarative-agent-developer) skill (or `atk new -c declarative-agent-with-action-from-mcp`), then add `package.json`, `tsconfig.json`, and `src/index.ts` with an Express MCP server using `express-jwt`.

> A sibling skill that scaffolds the Express MCP server boilerplate end-to-end is planned as a follow-up.

## Skills

| Skill | What It Does |
|-------|-------------|
| [**setup-sso**](./skills/setup-sso/SKILL.md) | End-to-end SSO setup: Entra app registration, dev tunnel, ATK SSO registration, config patching, sideload to M365 Copilot |
| [**setup-sso-ui-widget**](./skills/setup-sso-ui-widget/SKILL.md) | SSO for `ui-widget-developer` agents (OAI Apps): adapts to the `mcpPlugin.json` + `mcp-server/` layout, reuses the existing dev tunnel, injects a minimal JWKS guard (no express rewrite), wires `OAuthPluginVault`, sideloads, and prints app-registration details. SSO only — no OBO. |

## License

See the root `LICENSE` file.
