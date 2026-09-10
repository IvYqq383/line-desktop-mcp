# Codex × LINE Desktop — Windows Community Edition

[繁體中文](../README.md) · [Windows setup](quickstart-windows.md) · [Release v1.2.0](https://github.com/bensonmaxai/line-desktop-mcp/releases/tag/v1.2.0)

![LINE Desktop MCP: read, search, send, draft and export](assets/line-mcp-cover.png)

A community-maintained LINE Desktop MCP built from the maintainer's ongoing local use with **Codex**. Connect Codex to an already signed-in LINE Desktop application to read recent chats, find messages, send replies, manage drafts and export records. Other clients supporting local MCP can also connect; this project's everyday workflow and documentation center on Codex.

Enable `LINE_MCP_EXTENSIONS=1` on Windows for **24 tools**. The original five-tool interface remains the default, and macOS keeps those five tools. This is a desktop GUI bridge, unaffiliated with LINE.

## What it does

| Workflow | Capability |
| --- | --- |
| Read conversations | Structured recent messages with real date and count filters |
| Search and check | Literal search, optional sender/date filters and exact-text presence checks |
| Send messages | Direct text sending or an unsent draft inside LINE |
| Manage drafts | Read, write, verify and clear a draft while protecting concurrent user edits |
| Export records | New-file-only TXT, JSON and CSV exports with readback and SHA-256 |
| Work with the UI | Named-chat observation, feature navigation, quoted-reply preparation, copy, translation and forwarding selection when controls can be verified |

## Install this version

```powershell
git clone --branch v1.2.0 --depth 1 https://github.com/bensonmaxai/line-desktop-mcp.git
cd line-desktop-mcp
npm install --ignore-scripts
```

Configure your MCP client to run `node` with the absolute path to `src/server.js` and set `LINE_MCP_EXTENSIONS=1`. Desktop automation needs your separately installed LINE/AutoHotkey v2 setup. UI-dependent extension tools also need a compatible CUA Driver at the absolute executable path specified by `LINE_MCP_CUA_DRIVER`.

Startup is noninteractive: it does not display setup dialogs, install dependencies, change PATH or create setup markers. The static `get_line_capabilities` query works without LINE, AutoHotkey or CUA. See the [Windows guide](quickstart-windows.md) for source/tarball installation and complete MCP JSON examples.

The [GitHub release](https://github.com/bensonmaxai/line-desktop-mcp/releases/tag/v1.2.0) includes an npm `.tgz` and checksums. Registry `line-desktop-mcp@latest` and the inherited MCPB manifest still point to upstream; they do not install this community release.

## Behavior and verification

History covers the messages currently loaded by LINE, not a complete server archive. Exports are readable records, not restorable LINE account backups. Direct sending and draft mode are separate tools; a plain `@Name` is ordinary text rather than a real LINE mention.

The extension checks chat identity and protects drafts from changed values. Some client-drawn controls need visual handling; adapters return explicit refusal when their targets cannot be verified. Local Windows OCR is used by the bridge. The MCP client and model may process returned content according to their own configuration.

`npm test` covers protocol compatibility, filtering/export, draft and window guards, AHK generation, operation locks and fresh noninteractive startup. Source tests use synthetic inputs; packaged stdio startup and metadata were also exercised. The dated [live verification record](windows-extensions.md#live-verification-and-remaining-limits) describes the additional checks performed in this extension pass, separately from the maintainer's earlier usage.

## Credits and license

Original project by [Geoffrey Wang / dtwang](https://github.com/dtwang/line-desktop-mcp). Community extension and release maintained by [bensonmaxai](https://github.com/bensonmaxai/line-desktop-mcp), with the core extension contributed through [upstream PR #4](https://github.com/dtwang/line-desktop-mcp/pull/4).

[MIT License](../LICENSE.md). Original copyright attribution is retained. Documentation images are AI-generated conceptual illustrations, not real LINE screenshots or official product assets.
