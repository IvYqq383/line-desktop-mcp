# 安裝與使用教學（Windows）

[回專案首頁](../README.md) · [功能介紹](features.md) · [技術細節](windows-extensions.md)

這份文件把安裝與日常使用整理成可以照著做的步驟。若只想看指令，請直接跳到[三步驟安裝](#三步驟安裝)。

---

## 它是什麼

這是一個 **MCP server**，讓 AI 客戶端（Codex CLI、Claude Code 等）透過**你電腦上已登入的 LINE Desktop** 讀取聊天、搜尋訊息、整理草稿與發送回覆。

- 走的是桌面 GUI 自動化，**不是** LINE Messaging API，不需要申請官方帳號或 token。
- 所有操作都在本機執行，OCR 也在本機；聊天內容不會送到專案的任何伺服器。
- 只能讀到 **LINE 當下已載入的記錄**，不是帳號完整歷史備份。

---

## 開始前要準備

| 項目 | 說明 | 必要性 |
| --- | --- | --- |
| Windows | 擴充的 24 個工具只在 Windows 啟用 | 必要 |
| Node.js 18 以上 | [nodejs.org](https://nodejs.org/)，`node -v` 可查 | 必要 |
| LINE Desktop（已登入） | 工具操作的就是這個視窗 | 必要 |
| AutoHotkey v2 | [autohotkey.com](https://www.autohotkey.com/)，且 `autohotkey.exe` 要能由 `PATH` 找到 | 讀取記錄／傳送訊息時必要 |
| MCP 用戶端 | 能啟動本機 stdio server（Codex CLI、Claude Code…） | 必要 |
| CUA Driver | 視窗與介面操作用；本專案不提供也不會自動安裝 | 選配，UI 工具才需要 |

檢查 AutoHotkey 是否就緒：

```powershell
Get-Command autohotkey.exe
```

沒有 CUA Driver 也能安裝完成，只是 UI 相依的工具會回報 `LINE_UI_BACKEND_UNAVAILABLE`，其他工具照常運作。

---

## 三步驟安裝

### 1. 取得程式

```powershell
New-Item -ItemType Directory -Force C:\Tools | Out-Null
git clone https://github.com/IvYqq383/line-desktop-mcp.git C:\Tools\line-desktop-mcp
Set-Location C:\Tools\line-desktop-mcp
```

### 2. 執行安裝腳本

腳本會檢查 Windows／Node／AutoHotkey／LINE，安裝 npm 相依套件，然後產生或註冊 MCP 設定。

```powershell
# 只印出通用 JSON 設定，不改動任何設定檔
.\scripts\install-windows.ps1

# 直接註冊到 Codex CLI
.\scripts\install-windows.ps1 -Client codex

# 直接註冊到 Claude Code，並指定 CUA Driver
.\scripts\install-windows.ps1 -Client claude-code -CuaDriver C:\Tools\cua-driver\cua-driver.exe
```

若出現「執行原則」錯誤，可改用：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1 -Client codex
```

常用參數：

| 參數 | 用途 |
| --- | --- |
| `-Client json\|codex\|claude-code` | 印出設定，或直接註冊到該用戶端（預設 `json`，只印出） |
| `-CuaDriver <絕對路徑.exe>` | 啟用 UI 相依工具 |
| `-NoExtensions` | 保留預設的 5 個工具，不啟用 24 個 |
| `-AddAhkToPath` | 找到 AutoHotkey 但不在 `PATH` 時，自動加入使用者 `PATH` |
| `-RunTests` | 安裝後執行 `npm test` |
| `-SkipInstall` | 略過 `npm install` |

<details>
<summary>不想跑腳本？手動安裝對照</summary>

```powershell
Set-Location C:\Tools\line-desktop-mcp
npm install --ignore-scripts

codex mcp add line-desktop-mcp `
  --env LINE_MCP_EXTENSIONS=1 `
  --env LINE_MCP_CUA_DRIVER=C:/Tools/cua-driver/cua-driver.exe `
  -- node C:/Tools/line-desktop-mcp/src/server.js
```

其他用戶端使用通用 JSON：

```json
{
  "mcpServers": {
    "line-desktop-mcp": {
      "command": "C:/Program Files/nodejs/node.exe",
      "args": ["C:/Tools/line-desktop-mcp/src/server.js"],
      "env": {
        "LINE_MCP_EXTENSIONS": "1"
      }
    }
  }
}
```

路徑請換成自己機器上的實際絕對路徑。`LINE_MCP_EXTENSIONS` 要設成精確值 `1` 才會啟用 24 個工具。

</details>

### 3. 驗證

重新連線或重啟 MCP 用戶端，讓它重新讀取工具清單，然後請 AI 呼叫：

```text
呼叫 get_line_capabilities，告訴我 toolCount 和 platform。
```

看到 `toolCount: 24`、`platform: "win32"` 就代表擴充已啟用。這個查詢**不會**讀取聊天室、不會操作 LINE、不會送出訊息。

只看到 `toolCount: 5`，表示 `LINE_MCP_EXTENSIONS` 沒有生效——確認值是 `1`，並重新連線用戶端。

---

## 第一次使用：讀 → 擬 → 送

打開並登入 LINE Desktop，然後用一般中文對 AI 下指令即可，不必記工具名稱。

**① 讀取指定聊天室**

```text
讀取「專案討論」最近 20 則訊息，整理討論重點和還沒處理的事項。
```

**② 依上下文整理回覆**

```text
根據上面的內容，幫我擬一則回覆，語氣客氣一點，先放進草稿不要送出。
```

**③ 發送，或先留草稿**

```text
確認沒問題，把剛剛那則草稿發送到「專案討論」。
```

兩種送出方式的差別：

| 方式 | 行為 |
| --- | --- |
| `send_message_manual` / `set_line_draft` | 只把文字放進 LINE 輸入框，**不會送出**，你再自己按 Enter |
| `send_message_auto` | **直接送出**到指定聊天室 |

> 建議一開始先固定用草稿模式，確認聊天室名稱抓得準、內容格式正確後，再改用直接發送。

---

## 常用指令範例

| 想做的事 | 可以這樣說 |
| --- | --- |
| 讀取上下文 | 讀取「Demo」最近 30 則訊息，用條列整理重點。 |
| 找訊息 | 在「Demo」近期記錄中找「報價」，列出日期、發話者和原文。 |
| 核對文字 | 確認「Demo」裡是否出現過這段文字：明天下午三點開會。 |
| 存成檔案 | 把「Demo」最近 50 則訊息匯出成 CSV，存到 C:\Users\me\Desktop\demo.csv。 |
| 留草稿 | 把這段回覆放進「Demo」的草稿，我晚點再編輯。 |
| 讀回草稿 | 「Demo」現在的草稿內容是什麼？ |
| 清掉草稿 | 清除「Demo」的草稿。 |
| 直接發送 | 傳給「Demo」：資料已整理完成，稍後補上附件。 |
| 附件 | 幫我在「Demo」的檔案選擇視窗填入 C:\Users\me\Desktop\report.pdf。 |
| 開面板 | 打開「Demo」的記事本。 |

聊天室名稱要**和 LINE 上顯示的完全一致**（含空白與符號），否則會回報 `LINE_CHAT_NOT_FOUND`。

---

## 使用時要注意

- **聊天室名稱要精確**：工具不會猜測近似名稱，找不到唯一目標就會停下並說明原因。
- **`send_message_auto` 會真的送出**：使用前確認收件聊天室與內容，這是這個 bridge 的標準使用契約。
- **`@名字` 只是純文字**：一般文字中的 `@` 不等於 LINE 的藍色提及通知。
- **`verify_line_message` 不等於已讀**：它只確認這次讀取範圍內存在相同文字，不能證明對方收到或已讀。
- **匯出不是備份**：匯出檔供閱讀與整理使用，不能還原成 LINE 帳號備份，而且不會覆寫既有檔案。
- **執行中不要動滑鼠鍵盤**：這些工具靠 GUI 自動化操作 LINE 視窗，操作中請讓它跑完。
- **草稿有保護**：要取代既有草稿時會先核對舊值，避免蓋掉你剛改的內容。

---

## 疑難排解

| 狀況 / 錯誤碼 | 原因 | 解法 |
| --- | --- | --- |
| `toolCount` 只有 5 | `LINE_MCP_EXTENSIONS` 未生效 | 確認值為精確的 `1`，並重新連線用戶端 |
| `platform` 不是 `win32` | 在 macOS 上執行 | macOS 維持原本的 5 個工具介面 |
| `LINE_UI_BACKEND_UNAVAILABLE` | 沒有設定 CUA Driver | 設定 `LINE_MCP_CUA_DRIVER` 為存在的絕對 `.exe` 路徑；或改用不依賴 UI 的工具 |
| `AHK execution failed` | 找不到 AutoHotkey v2 | 安裝 v2，並讓 `autohotkey.exe` 出現在 `PATH`（可用 `-AddAhkToPath`） |
| `LINE_CHAT_NOT_FOUND` | 聊天室名稱不完全相符 | 從 LINE 複製完整名稱，注意前後空白 |
| `LINE_DRAFT_CONFLICT` | 輸入框已有草稿 | 先讀回或清除既有草稿，再寫入新內容 |
| `LINE_EXPORT_EXISTS` | 匯出路徑已有檔案 | 換一個新檔名；工具不會覆寫既有檔案 |
| `LINE_BUSY` | 另一個 LINE 操作進行中 | 等前一個操作結束後再試 |
| 讀不到較舊的訊息 | 只能讀 LINE 已載入的內容 | 在 LINE 視窗先往上捲，或改用 `_long` 版本的歷史工具 |
| 工具清單沒更新 | 用戶端快取了舊清單 | 重新連線 / 重啟用戶端 |

---

## 只想要預設的 5 個工具

安裝時加上 `-NoExtensions`，或在設定中移除 `LINE_MCP_EXTENSIONS` 與 CUA 的環境變數即可。

## 移除

```powershell
codex mcp remove line-desktop-mcp     # 或 claude mcp remove line-desktop-mcp
Remove-Item -Recurse -Force C:\Tools\line-desktop-mcp
```

其他用戶端則從設定檔中刪除 `line-desktop-mcp` 這一段。

---

## 開發與回報

```powershell
npm test
```

測試使用合成訊息與模擬介面，不會讀取真實聊天室或送出訊息。回報問題時附上作業系統、LINE／Node／CUA 版本、工具名稱與去識別化的錯誤資訊；請不要放入真實聊天內容或帳號資料。
