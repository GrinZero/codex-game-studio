---
name: setup
description: Set up the local Open Game Studio developer package and check available capabilities.
---

Use for first setup of this local development package. Do not use to deploy a public service.

For an installed Codex plugin, call `studio_open` first. The local installer has
already supplied dependencies and a background HTTP service; do not run npm in
the plugin cache. The host displays the attached MCP App; use the returned URL
as a fallback only when the user wants the browser workbench. If the
HTTP service is unavailable, inspect `~/.game-studio/http.error.log` (or the
configured STUDIO_HOME) and the `local.codex.game-studio` user LaunchAgent.
The stable runtime is `~/.local/share/codex-integrations/game-studio-local/runtime`.
The steps below apply to a source checkout without the local installation.

1. Confirm Node 24 or later. Install this package's locked dependencies with `npm ci` in the package directory if they are missing. No model credentials are required.
2. Run `npm run build`, then start `npm start` as a separate local process. Open the `studio_open` URL in a browser. It normally uses port 4310 and listens only on loopback.
3. UI and stdio MCP use the same default registry in `~/.game-studio`. If STUDIO_HOME is customized, set the same absolute directory for both processes.
4. Call `studio_open` with `{}`. It registers the Open Game Studio global sidebar and thread MCP App. If the sidebar entry is absent after update, verify `_meta['openai/ui'].entrypoints` and resource `ui://game-studio/workbench`, then ask the user to reopen Codex to refresh discovery. A browser URL alone does not establish a sidebar entry. The embedded UI uses an app-only MCP bridge; model generation and engine workers remain unavailable. Distinguish SDK sandbox verification from observation of the actual native host.
5. Resolve or create a project only when requested; do not associate arbitrary local directories. Complete setup by returning the workbench URL and capability report.

The root portable manifest is a development package. `npm run install:local`
builds and installs the macOS Codex package. Verify actual installation and
enablement with `codex plugin list --marketplace game-studio-local --json`, and
verify the installed MCP configuration and HTTP health before claiming success.
