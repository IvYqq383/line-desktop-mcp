# Windows community extensions

This community edition builds on the maintainer's ongoing local use of LINE history and message-sending workflows. The dated live-verification section below records the checks performed during this extension pass; an action not repeated in that pass is not a claim that the existing feature has never been used or validated.

The public release is maintained at [bensonmaxai/line-desktop-mcp](https://github.com/bensonmaxai/line-desktop-mcp). Use the [Windows quickstart](quickstart-windows.md) for v1.2.0. Server startup is noninteractive: it does not install dependencies, show setup dialogs or modify the machine PATH.

Set `LINE_MCP_EXTENSIONS=1` to expose the optional 24-tool Windows interface. Without this exact value, the five existing tool descriptors, their order and successful result shapes remain unchanged. macOS keeps those five tools even if the flag is set. This is a GUI bridge for an already signed-in LINE Desktop app, not the LINE Messaging API.

The extension replaces the five overlapping history/text handlers and adds nineteen tools. Opting in therefore changes their behavior: history has real date/count filtering and explicit incomplete-source warnings; text staging/sending requires a verified chat and protected composer. Existing automation that expects unrestricted legacy sends should keep the extension disabled until updated.

## Setup from this source revision

Use this fork's v1.2.0 source tag or GitHub release npm tarball. Upstream npm `latest` is maintained separately; a GitHub release or pull request does not update that registry package. Friends can install the fixed community version without waiting for the upstream PR to merge.

1. Complete the project's existing Node.js, LINE Desktop and AutoHotkey v2 setup.
2. In the checked-out revision, run `npm install --ignore-scripts`.
3. Set `LINE_MCP_EXTENSIONS=1` in the MCP server process environment.
4. For UI-dependent tools, independently install a compatible CUA Driver and set `LINE_MCP_CUA_DRIVER` to its absolute `.exe` path. This project does not install or start a persistent CUA service, and does not search a particular user's machine for a binary.
5. Start `node src/server.js`, or configure your MCP client to run that entry point with the same environment. Reconnect existing clients to refresh their cached tool list.

For an already installed `cua-driver.exe` on PATH, a PowerShell session can use:

```powershell
$env:LINE_MCP_EXTENSIONS = '1'
$env:LINE_MCP_CUA_DRIVER = (Get-Command cua-driver.exe).Source
node src/server.js
```

Metadata/workflow queries and bounded history/search/export/verification do not require CUA. History still requires the existing LINE/AutoHotkey setup. UI tools report `LINE_UI_BACKEND_UNAVAILABLE` when the executable is missing or invalid; they never silently fall back to an unverified legacy send.

CUA interoperability was exercised with Driver 0.23.2 via its public stdio `mcp` mode and live input schemas. The [public CUA Driver source and build documentation](https://github.com/trycua/cua/tree/main/libs/cua-driver/rust) describe the separately maintained driver. A different driver must expose the same required capabilities; this project does not guarantee that a current installer provides the exact tested version. OCR is local Windows PowerShell 5.1 / Windows.Media.Ocr; installed language support and small-font recognition affect availability. The npm package includes the OCR helper. No cloud OCR or screenshot upload is used by this bridge.

The inherited `.mcpb` manifest launches upstream npm `latest` through `npx`; the bundle builder also omits installed dependencies. That route does **not** distribute this community release. Use the v1.2.0 source tag or the npm tarball from this fork's GitHub release; no new self-contained `.mcpb` release is provided.

## Tool coverage

| Area | Tools |
| --- | --- |
| History | Three existing `get_line_chatroom_history_*` tools; `get_line_chat_messages`, `search_line_chat_messages`, `verify_line_message`, `export_line_chat_history` |
| Inventory and observation | `get_line_capabilities`, `get_line_workflow`, `get_line_status`, `open_line_chat`, `get_line_ui_state`, `confirm_line_chat_view` |
| Drafts and sends | `get_line_draft`, `set_line_draft`, `clear_line_draft`, `send_message_manual`, `send_message_auto`, `send_file_manual` |
| UI navigation and message actions | `open_line_chat_feature`, `stage_line_reply`, `copy_line_message`, `translate_line_message`, `stage_line_forward` |

The capability catalogue groups 33 practical feature families. That is an inventory for this bridge, not an official exhaustive count of LINE features or a claim of 33 automatic actions. `get_line_workflow` returns guidance and performs no UI operation.

### Source and export semantics

- Reads cover only history currently loaded by LINE. `messageLimit` bounds returned timestamped records; there is no full-account or server-side archive guarantee.
- Date filters validate real calendar dates before touching LINE. Searches are literal and bounded to the retrieved history window.
- Copied text may omit sender delimiters. Such rows preserve their original text as `kind: unknown` with warnings; the parser never invents a sender from a URL or silently labels ordinary text as a system event.
- `verify_line_message` proves exact text presence only, not a new send, recipient delivery or mention notification.
- TXT/JSON/CSV exports require a new absolute local path. Existing paths, network paths, reparse parents and Windows alternate data streams are refused. CSV neutralizes formula-leading cells. Readback and SHA-256 verify the output; these files are not restorable LINE account backups.

### UI identity and confirmation

Each action is scoped to a named chat and an exact LINE PID/window. Accessible headers or exact detached-chat titles can prove identity. When a main header is custom drawn, request `get_line_ui_state` with `includeScreenshot: true`; inspect the returned header crop, then call `confirm_line_chat_view` with its short-lived token and the observed header. Subsequent actions compare fresh header pixels. This confirms the view only; it does not establish user permission to send or publish.

Callers must obtain the intended recipient/content approval before sends, uploads, forwarding or shared changes. Show ordinary reply drafts in the assistant conversation first. `send_message_manual` and `set_line_draft` stage without sending; an existing draft needs exact-value protection. `send_file_manual` only fills the LINE-owned native file picker: clicking Open is the separate send/upload boundary.

Feature navigation defaults to background. After a refusal or a freshly verified no-op, an explicit `deliveryMode: "foreground"` may bring LINE forward. No automatic foreground retry or send replay occurs. A dispatch result alone is not effect or delivery proof; inspect the resulting UI before deciding what to do next.

### Live verification and remaining limits

The source workflow was exercised on Windows LINE 26.4.2.3957 with two explicitly authorized chats. Bounded history/date/search/exact-presence/export checks and a multiline draft write/readback/clear cycle passed. The normal main-window Search control opened and its already-open state was verified. No outbound send, upload, vote or shared edit was performed during these checks.

The nine navigation values are `search`, `notes`, `albums`, `polls`, `media`, `files`, `links`, `stickers` and `attachment`. A listed adapter can refuse on a client whose controls cannot be verified. In particular:

- More opened, but Windows OCR omitted several visible short menu labels, including Polls. Scaling/cropping/preprocessing did not establish stable exact recognition, so the adapter refuses instead of guessing. Polls was opened through separate visual CUA navigation; that is not an end-to-end pass of the automatic Polls adapter.
- Notes navigation did not produce a verified Notes panel in either background or foreground mode.
- Member viewing is guided-only because the observed More menu has Invite but no Members entry. Invite is never substituted for a member list.
- Real blue-token mentions, reactions, recall/delete, poll/album/note creation, calls and shared edits remain explicit visual workflows. Copy/reply/translate/forward require an exact accessible message and have not been live-certified on every client.
- File staging has generated-script regression coverage, including escaped filename propagation and no Open/Enter. There was no live attachment test.

## Concurrency and recovery

All Windows facade operations and UI extension operations share `~/.line-desktop-mcp/operation.lock`, where `~` is the operating-system user's home. The directory is created lazily. The lock contains only ownership metadata and an operation kind, not a chat name or message. Contention returns `LINE_BUSY`; there is no automatic stale-lock takeover or action replay.

After a crash leaves a lock, first stop the relevant LINE MCP processes, inspect its recorded PID and current LINE state, and confirm that no owner is active. Only then remove that exact lock file manually. Do not clear another process's live lock or retry a possibly completed send blindly. Cleanup failures explicitly mark an operation as potentially completed.

## Tests

Run `npm test`. The suite uses synthetic content and fake GUI inputs; it does not read chats or send messages. It covers the original five-tool contract, the unique opt-in catalogue, missing-CUA behavior, filtering/exports, draft guards, uncertain outcomes, native AHK generation and cross-process lock ownership. Windows-only OCR/crop tests generate local images and use the installed Windows runtime. Test passes are separate from live-client certification.
