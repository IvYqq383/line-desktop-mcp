# 安裝與使用教學（Windows）

[回專案首頁](../README.md) · [功能介紹](features.md) · [技術細節](windows-extensions.md)

這份文件把安裝與日常使用整理成可以照著做的步驟。只想看指令，請跳到[一行安裝](#一行安裝)。

---

## 它是什麼

一個 **MCP server**，讓 AI 客戶端（Codex CLI、Claude Code 等）透過**你電腦上已登入的 LINE Desktop** 讀取聊天、搜尋訊息、整理草稿與發送回覆。

- 走桌面 GUI 自動化，**不是** LINE Messaging API，不需要申請官方帳號或 token。
- 全部在本機執行，OCR 也在本機；聊天內容不會送到專案的任何伺服器。
- 只能讀到 **LINE 當下已載入的記錄**，不是帳號完整歷史備份。

---

## 先看這個：兩個外部元件決定你能做什麼

24 個工具分成兩條路徑，各自依賴不同的外部程式。**缺哪個，對應的工具就整組不能用。**

| 你想做的事 | 走哪條路徑 | 必須先裝好 |
| --- | --- | --- |
| 讀取記錄、搜尋、驗證文字、匯出 | AutoHotkey | **AutoHotkey v2** |
| 草稿、發送訊息、附件、開面板、聊天室導覽 | CUA Driver | **CUA Driver** |

也就是說：

> **沒有 CUA Driver 就不能發送訊息，也不能寫草稿。**
> 這 15 個工具會直接回報 `LINE_UI_BACKEND_UNAVAILABLE`：
> `send_message_auto`、`send_message_manual`、`send_file_manual`、`get_line_draft`、`set_line_draft`、`clear_line_draft`、`get_line_status`、`open_line_chat`、`get_line_ui_state`、`confirm_line_chat_view`、`open_line_chat_feature`、`stage_line_reply`、`copy_line_message`、`translate_line_message`、`stage_line_forward`。
>
> 沒有 CUA Driver 仍可正常運作的是這 9 個：`get_line_capabilities`、`get_line_workflow`、`get_line_chatroom_history_short`／`_default`／`_long`、`get_line_chat_messages`、`search_line_chat_messages`、`verify_line_message`、`export_line_chat_history`。

CUA Driver **不由本專案提供、也不會自動安裝**，需要你自行取得相容版本（維護者實測版本為 0.23.2）。只想先用「讀取、搜尋、匯出」可以不裝，安裝流程照樣會完成。

---

## 先決條件

| 項目 | 說明 | 必要性 |
| --- | --- | --- |
| Windows | 擴充的 24 個工具只在 Windows 啟用 | 必要 |
| Node.js 18 以上 | [nodejs.org](https://nodejs.org/)，`node -v` 可查 | 必要 |
| LINE Desktop（已登入） | 工具操作的就是這個視窗 | 必要 |
| AutoHotkey **v2** | [autohotkey.com](https://www.autohotkey.com/)，且 `autohotkey.exe` 要能由 `PATH` 找到 | 讀取／搜尋／匯出必要 |
| CUA Driver | 自行取得；本專案不提供也不會自動安裝 | **草稿與發送等 15 個工具必要** |
| MCP 用戶端 | 能啟動本機 stdio server（Codex CLI、Claude Code…） | 必要 |

AutoHotkey 必須是 **v2**：v1 的預設安裝路徑和 v2 一樣，安裝腳本會讀版本資訊擋掉 v1。手動確認：

```powershell
Get-Command autohotkey.exe
(Get-Item (Get-Command autohotkey.exe).Source).VersionInfo.FileVersion
```

---

## 一行安裝

在 **PowerShell** 貼上這一行。它會下載安裝腳本、取得原始碼、安裝相依套件，並自動偵測 `codex` 與 `claude` CLI 完成註冊：

```powershell
irm https://raw.githubusercontent.com/IvYqq383/line-desktop-mcp/main/scripts/bootstrap.ps1 -OutFile "$env:TEMP\line-mcp-bootstrap.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\line-mcp-bootstrap.ps1"
```

要一併設定 CUA Driver（建議，否則不能發送）：

```powershell
powershell -ExecutionPolicy Bypass -File "$env:TEMP\line-mcp-bootstrap.ps1" -CuaDriver C:\Tools\cua-driver\cua-driver.exe
```

> **為什麼不是 `irm ... | iex` 或 `[scriptblock]::Create((irm ...))`？**
> 腳本含 UTF-8 BOM——Windows PowerShell 5.1 少了 BOM 會用 ANSI 代碼頁誤讀中文，讓整個檔案解析失敗。但 `irm` 回傳的字串若保留 BOM，`scriptblock` 又會在第一個 token 就掛掉。先存檔再以 `-File` 執行可以同時避開兩者。
>
> 從網路抓腳本直接執行有其風險。介意的話可以先看內容再跑：把上面第一段的 `irm ... -OutFile ...` 單獨執行，用記事本打開 `%TEMP%\line-mcp-bootstrap.ps1` 確認後，再執行第二段。

bootstrap 可用參數：`-InstallDir`（預設 `C:\Tools\line-desktop-mcp`）、`-Ref`、`-CuaDriver`、`-Client`、`-NoExtensions`、`-RunTests`。

重複執行是安全的：已存在的 checkout 只做**快轉更新**，偵測到未推送的本機 commit 會停下來不覆寫。

<details>
<summary>手動安裝（不想用一行指令）</summary>

```powershell
git clone https://github.com/IvYqq383/line-desktop-mcp.git C:\Tools\line-desktop-mcp
cd C:\Tools\line-desktop-mcp
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1 -Client auto
```

安裝腳本參數：

| 參數 | 用途 |
| --- | --- |
| `-Client auto\|json\|codex\|claude-code` | 可給多個，如 `-Client codex,claude-code`。`auto` 會註冊 PATH 上偵測到的每個 CLI；`json` 只印設定不改檔案。預設 `json` |
| `-CuaDriver <絕對路徑.exe>` | 啟用草稿與發送類工具 |
| `-NoExtensions` | 保留預設的 5 個工具，不啟用 24 個 |
| `-AddAhkToPath` | 找到 AutoHotkey v2 但不在 `PATH` 時，加入使用者 `PATH` |
| `-RunTests` | 安裝後執行 `npm test` |
| `-SkipInstall` | 略過 `npm install` |

完全手動設定其他 MCP 用戶端時的通用 JSON：

```json
{
  "mcpServers": {
    "line-desktop-mcp": {
      "command": "C:/Program Files/nodejs/node.exe",
      "args": ["C:/Tools/line-desktop-mcp/src/server.js"],
      "env": {
        "LINE_MCP_EXTENSIONS": "1",
        "LINE_MCP_CUA_DRIVER": "C:/Tools/cua-driver/cua-driver.exe"
      }
    }
  }
}
```

路徑換成自己機器上的實際絕對路徑。`LINE_MCP_EXTENSIONS` 要是精確值 `1` 才會啟用 24 個工具。

</details>

### Claude Code 使用者注意

安裝腳本會以 `claude mcp add --scope user` 註冊。`claude mcp add` 的預設是 `--scope local`，那只對「執行指令時所在的資料夾」生效——換個專案目錄就找不到這個 server。自己手動加的話記得補上 `--scope user`。

---

## 驗證

重新連線或重啟 MCP 用戶端，讓它重讀工具清單，然後請 AI 呼叫：

```text
呼叫 get_line_capabilities，告訴我 toolCount 和 platform。
```

看到 `toolCount: 24`、`platform: "win32"` 就代表擴充已啟用。這個查詢**不會**讀取聊天室、不會操作 LINE、不會送出訊息。

如果得到的是 **`Unknown tool: get_line_capabilities`**，表示還在 5 個工具的預設模式——`get_line_capabilities` 本身就是擴充才有的工具。檢查設定裡的 `LINE_MCP_EXTENSIONS` 是不是精確值 `1`，然後重新連線。

---

## 第一次使用：讀 → 擬 → 送

打開並登入 LINE Desktop，然後用一般中文下指令即可，不必記工具名稱。

**① 讀取指定聊天室**（只需要 AutoHotkey）

```text
讀取「專案討論」最近 20 則訊息，整理討論重點和還沒處理的事項。
```

**② 依上下文整理回覆**（純 AI 作業，不碰 LINE）

```text
根據上面的內容，幫我擬一則回覆，語氣客氣一點，先放進草稿不要送出。
```

**③ 發送，或先留草稿**（**需要 CUA Driver**）

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

| 想做的事 | 可以這樣說 | 需要 |
| --- | --- | --- |
| 讀取上下文 | 讀取「Demo」最近 30 則訊息，用條列整理重點。 | AHK |
| 找訊息 | 在「Demo」近期記錄中找「報價」，列出日期、發話者和原文。 | AHK |
| 核對文字 | 確認「Demo」裡是否出現過這段文字：明天下午三點開會。 | AHK |
| 存成檔案 | 把「Demo」最近 50 則訊息匯出成 CSV，存到 C:\Users\me\Desktop\demo.csv。 | AHK |
| 留草稿 | 把這段回覆放進「Demo」的草稿，我晚點再編輯。 | CUA |
| 讀回草稿 | 「Demo」現在的草稿內容是什麼？ | CUA |
| 清掉草稿 | 清除「Demo」的草稿。 | CUA |
| 直接發送 | 傳給「Demo」：資料已整理完成，稍後補上附件。 | CUA |
| 附件 | 幫我在「Demo」的檔案選擇視窗填入 C:\Users\me\Desktop\report.pdf。 | CUA |
| 開面板 | 打開「Demo」的記事本。 | CUA |

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
| `Unknown tool: get_line_capabilities` | 還在 5 個工具的預設模式 | 確認 `LINE_MCP_EXTENSIONS` 為精確值 `1`，並重新連線用戶端 |
| `LINE_UI_BACKEND_UNAVAILABLE` | 沒有設定 CUA Driver（或路徑無效） | 設定 `LINE_MCP_CUA_DRIVER` 為存在的絕對 `.exe` 路徑，前後不能有空白；沒有 driver 時改用記錄讀取類工具 |
| `AHK execution failed` | 找不到 AutoHotkey v2 | 安裝 **v2**，並讓 `autohotkey.exe` 出現在 `PATH`（可用 `-AddAhkToPath`） |
| 工具呼叫沒有回應、畫面跳出 AHK 錯誤視窗 | PATH 上的是 AutoHotkey **v1** | 腳本產生的 AHK 需要 `#Requires AutoHotkey v2.0`；改裝 v2 |
| `LINE_CHAT_NOT_FOUND` | 聊天室名稱不完全相符 | 從 LINE 複製完整名稱，注意前後空白 |
| `LINE_DRAFT_CONFLICT` | 輸入框已有草稿 | 先讀回或清除既有草稿，再寫入新內容 |
| `LINE_EXPORT_EXISTS` | 匯出路徑已有檔案 | 換一個新檔名；工具不會覆寫既有檔案 |
| `LINE_BUSY` | 另一個 LINE 操作進行中 | 等前一個操作結束後再試 |
| Claude Code 換個資料夾就找不到工具 | 用 `claude mcp add` 但沒加 `--scope user`（預設是 local） | 重新以 `--scope user` 註冊，或直接重跑安裝腳本 |
| 讀不到較舊的訊息 | 只能讀 LINE 已載入的內容 | 在 LINE 視窗先往上捲，或改用 `_long` 版本的歷史工具 |
| `因為這個系統上已停用指令碼執行` | PowerShell 執行原則 | 用 `powershell -ExecutionPolicy Bypass -File <腳本>` 執行 |
| 工具清單沒更新 | 用戶端快取了舊清單 | 重新連線 / 重啟用戶端 |

---

## 只想要預設的 5 個工具

安裝時加上 `-NoExtensions`，或在設定中移除 `LINE_MCP_EXTENSIONS` 與 CUA 的環境變數即可。這個模式沒有 `get_line_capabilities`，直接看用戶端的工具清單是不是 5 個。

## 移除

```powershell
codex mcp remove line-desktop-mcp
claude mcp remove --scope user line-desktop-mcp
Remove-Item -Recurse -Force C:\Tools\line-desktop-mcp
```

其他用戶端則從設定檔中刪除 `line-desktop-mcp` 這一段。安裝腳本不會在系統其他地方留下檔案；只有用過 `-AddAhkToPath` 時會在使用者 `PATH` 多一筆 AutoHotkey 目錄。

---

## 開發與回報

```powershell
npm test
```

測試使用合成訊息與模擬介面，不會讀取真實聊天室或送出訊息。回報問題時附上作業系統、LINE／Node／CUA 版本、工具名稱與去識別化的錯誤資訊；請不要放入真實聊天內容或帳號資料。
