# Windows 快速安裝

本頁適用於 [`bensonmaxai/line-desktop-mcp` 的 `v1.2.0`](https://github.com/bensonmaxai/line-desktop-mcp/releases/tag/v1.2.0)。這是維護者已在本機持續使用的 Windows 社群版：預設保留 5 個既有工具；設定後可使用 24 個 Windows 工具，涵蓋受限歷史、搜尋／驗證／匯出、直接文字傳送、草稿保護與 UI 導航。它透過已登入 LINE Desktop 的 GUI bridge 運作，不是 LINE Messaging API，並可直接加入本機 Codex MCP 設定。本頁只使用指定版本的原始碼或 npm package `.tgz`，不使用 registry 的 `latest` 或目前的 `.mcpb`。

## 先決條件

- Windows 與 Node.js 18 以上版本。
- 要讀取或操作 LINE Desktop 前，先安裝並登入 LINE Desktop。
- 要執行現有的桌面自動化工具時，先安裝 AutoHotkey v2，並讓 `autohotkey.exe` 可由 `PATH` 找到。可用 `Get-Command autohotkey.exe` 檢查。
- MCP 用戶端必須能啟動本機 stdio server。

伺服器啟動本身不會安裝 AutoHotkey、CUA Driver、修改 `PATH`，也不會寫入設定完成標記。`get_line_capabilities` 可在尚未設定 AutoHotkey 或 CUA Driver 時使用；它只回傳這個 bridge 的靜態能力資料，不會讀取聊天室或操作 LINE。

## 由原始碼安裝

在 PowerShell 執行：

```powershell
New-Item -ItemType Directory -Force C:\Tools | Out-Null
git clone --branch v1.2.0 --depth 1 https://github.com/bensonmaxai/line-desktop-mcp.git C:\Tools\line-desktop-mcp
Set-Location C:\Tools\line-desktop-mcp
git describe --exact-match --tags
npm install --ignore-scripts
```

`git describe` 應輸出 `v1.2.0`。`--ignore-scripts` 會略過套件生命週期腳本；這個版本也不會在後續 server 啟動時自行安裝或設定桌面依賴。

## 由發行版 `.tgz` 安裝

只有當 [該版本的發行頁](https://github.com/bensonmaxai/line-desktop-mcp/releases/tag/v1.2.0) 明確提供 `line-desktop-mcp-1.2.0.tgz` 這個 npm package archive 時，才使用下列方式。GitHub 的「Source code (zip)」或「Source code (tar.gz)」不是 npm `.tgz`，請改用前一節。

```powershell
New-Item -ItemType Directory -Force C:\Tools\line-desktop-mcp-host | Out-Null
Set-Location C:\Tools\line-desktop-mcp-host
Invoke-WebRequest `
  -Uri https://github.com/bensonmaxai/line-desktop-mcp/releases/download/v1.2.0/line-desktop-mcp-1.2.0.tgz `
  -OutFile .\line-desktop-mcp-1.2.0.tgz
npm install --ignore-scripts .\line-desktop-mcp-1.2.0.tgz
```

此方式的 server entry point 是 `C:/Tools/line-desktop-mcp-host/node_modules/line-desktop-mcp/src/server.js`。若發行頁沒有這個 `.tgz`，不要猜測檔名或改用 `latest`；改用指定 tag 的原始碼安裝。

## 在 Codex 設定

確認 `node` 可由 `PATH` 找到後，於 PowerShell 執行以下指令，把原始碼安裝加入 Codex：

```powershell
codex mcp add line-desktop-mcp `
  --env LINE_MCP_EXTENSIONS=1 `
  --env LINE_MCP_CUA_DRIVER=C:/Tools/cua-driver/cua-driver.exe `
  -- node C:/Tools/line-desktop-mcp/src/server.js
```

`C:/Tools/cua-driver/cua-driver.exe` 與 server 路徑都是示意位置，請替換成實際存在的位置。尚未安裝 CUA Driver 時，刪除整個 `--env LINE_MCP_CUA_DRIVER=...` 參數；靜態能力工具仍可使用，UI 相依工具則會回報其設定狀態。若要使用上一節的 `.tgz`，將 server 路徑換成 `C:/Tools/line-desktop-mcp-host/node_modules/line-desktop-mcp/src/server.js`。

執行下列指令確認已加入，再重新連線 Codex 讓它重新讀取工具清單：

```powershell
codex mcp get line-desktop-mcp
```

要保留預設的 5 個工具，新增時省略 `--env LINE_MCP_EXTENSIONS=1` 與 CUA 的 `--env`；設定為精確值 `1` 才會啟用 Windows 的 24 個工具。

## 其他 MCP 用戶端（通用 JSON）

下列是 stdio MCP server 的通用 JSON 範例。`C:/Tools/node/node.exe` 是示意位置，請換成實際安裝的 Node `node.exe` 絕對路徑；原始碼安裝則保留以下的 server 路徑。

```json
{
  "mcpServers": {
    "line-desktop-mcp": {
      "command": "C:/Tools/node/node.exe",
      "args": [
        "C:/Tools/line-desktop-mcp/src/server.js"
      ],
      "env": {
        "LINE_MCP_EXTENSIONS": "1"
      }
    }
  }
}
```

若使用 `.tgz`，將 `args` 的路徑改成上一節列出的 `node_modules/line-desktop-mcp/src/server.js`。不同 MCP 用戶端放置 JSON 的位置不同；本範例不假定任何特定產品的設定檔路徑。

未設定 `LINE_MCP_EXTENSIONS=1` 時，Windows 保留原本的 5 個工具及其描述、順序和成功結果格式。設定為精確值 `1` 才會啟用 Windows 的 24 個工具；它會取代重疊的歷史／文字處理方式，使用前應讓用戶端重新連線並重新讀取工具清單。

## 文字傳送與草稿

啟用 24 個工具後，`send_message_auto` 可直接傳送已明確核准的聊天室與文字；`send_message_manual`、`set_line_draft` 與 `clear_line_draft` 則處理 LINE 內的草稿暫存與檢閱，不會直接送出。傳送前要求明確的收件聊天室與文字核准，是這個 MCP bridge 的標準使用契約；它不改變直接傳送功能本身。這些 24 工具模式的文字操作屬於 UI 相依路徑，需依下一節設定 CUA Driver。

### 選配 CUA Driver

CUA Driver 僅供 UI 相依的擴充工具使用。已自行安裝相容 driver 後，才將上方的 `env` 換成下列內容，並填入一個存在的絕對 `.exe` 路徑：

```json
{
  "LINE_MCP_EXTENSIONS": "1",
  "LINE_MCP_CUA_DRIVER": "C:/Tools/cua-driver/cua-driver.exe"
}
```

沒有 CUA Driver 時，UI 相依工具會回報 `LINE_UI_BACKEND_UNAVAILABLE`。CUA Driver 不會由本專案安裝、搜尋或常駐啟動。

## 靜態驗證

重新連線 MCP 用戶端後，在已啟用擴充的 Windows 設定呼叫：

```text
get_line_capabilities({})
```

結果應包含 `toolCount: 24` 與 `platform: "win32"`。這只確認目前載入的工具目錄；呼叫本身不讀取聊天室、不操作 LINE，也不會傳送訊息。

## 2026-09-10 新增 Windows 擴充檢查範圍

本輪針對新增擴充功能，檢查了受限歷史的日期／搜尋、精確文字存在、匯出，以及草稿寫入／讀回／清除；範圍是當時明確授權的測試聊天室與 LINE 已載入的歷史。這個日期化檢查描述的是本輪擴充，不重述或否定既有 bridge 的長期使用經驗。

## 實測版本與限制

| 項目 | 實測版本 |
| --- | --- |
| Node.js | 24.16 |
| LINE Desktop | 26.4.2.3957 |
| CUA Driver | 0.23.2 |

上述是本次測試環境，不是目前安裝程式、所有 Windows 版本或所有 LINE Desktop 版本的相容性保證。Windows 擴充的工具範圍、資料邊界與已驗證限制請見 [windows-extensions.md](windows-extensions.md)。
