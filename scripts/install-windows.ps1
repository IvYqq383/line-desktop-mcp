<#
.SYNOPSIS
    LINE Desktop MCP（Windows 社群版）安裝與設定輔助腳本。

.DESCRIPTION
    檢查先決條件（Windows、Node.js 18+、AutoHotkey v2）、安裝 npm 相依套件，
    並產生或註冊 MCP 用戶端設定。

    這個腳本不會安裝 Node.js、AutoHotkey 或 CUA Driver，也不會讀取聊天室或
    操作 LINE；它只做環境檢查、npm install 與設定輸出。

.PARAMETER InstallDir
    line-desktop-mcp 原始碼所在目錄。預設為這個腳本的上層目錄。

.PARAMETER CuaDriver
    CUA Driver 執行檔的絕對路徑（必須是存在的 .exe）。未提供時會略過 UI 相依設定。

.PARAMETER Client
    要產生設定的 MCP 用戶端：
      json        僅印出通用 JSON 設定（預設，不改動任何設定檔）
      codex       執行 codex mcp add 完成註冊
      claude-code 執行 claude mcp add 完成註冊

.PARAMETER NoExtensions
    不啟用 LINE_MCP_EXTENSIONS=1，保留預設的 5 個工具。

.PARAMETER AddAhkToPath
    找到 AutoHotkey v2 但不在 PATH 時，將其目錄加入使用者 PATH。

.PARAMETER SkipInstall
    略過 npm install（相依套件已安裝時使用）。

.PARAMETER RunTests
    安裝後執行 npm test。

.EXAMPLE
    .\scripts\install-windows.ps1 -Client codex

.EXAMPLE
    .\scripts\install-windows.ps1 -Client claude-code -CuaDriver C:\Tools\cua-driver\cua-driver.exe
#>
[CmdletBinding()]
param(
    [string]$InstallDir = (Split-Path -Parent $PSScriptRoot),
    [string]$CuaDriver = '',
    [ValidateSet('json', 'codex', 'claude-code')]
    [string]$Client = 'json',
    [switch]$NoExtensions,
    [switch]$AddAhkToPath,
    [switch]$SkipInstall,
    [switch]$RunTests
)

$ErrorActionPreference = 'Stop'

function Write-Step { param([string]$Message) Write-Host "`n== $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "   [OK] $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "   [!]  $Message" -ForegroundColor Yellow }
function Fail       { param([string]$Message) Write-Host "   [X]  $Message" -ForegroundColor Red; exit 1 }

Write-Host 'LINE Desktop MCP - Windows 安裝輔助' -ForegroundColor White

# --- 1. 平台 -----------------------------------------------------------------
Write-Step '檢查作業系統'
$isWindowsHost = $true
if (Get-Variable -Name IsWindows -Scope Global -ErrorAction SilentlyContinue) { $isWindowsHost = $IsWindows }
if (-not $isWindowsHost) { Fail '這個腳本只能在 Windows 執行；macOS 請沿用原本的 5 個工具介面。' }
Write-Ok 'Windows'

# --- 2. 安裝目錄 -------------------------------------------------------------
Write-Step '檢查安裝目錄'
if (-not (Test-Path -LiteralPath $InstallDir)) { Fail "找不到目錄：$InstallDir" }
$InstallDir = (Resolve-Path -LiteralPath $InstallDir).Path
$serverEntry = Join-Path $InstallDir 'src\server.js'
if (-not (Test-Path -LiteralPath $serverEntry)) {
    Fail "在 $InstallDir 找不到 src\server.js，請確認 -InstallDir 指向 line-desktop-mcp 原始碼根目錄。"
}
Write-Ok $InstallDir

# --- 3. Node.js --------------------------------------------------------------
Write-Step '檢查 Node.js（需要 18 以上）'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { Fail 'PATH 中找不到 node，請先安裝 Node.js 18 以上：https://nodejs.org/' }
$nodeVersion = (& node -v).Trim()
$nodeMajor = [int]($nodeVersion.TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 18) { Fail "Node.js 版本為 $nodeVersion，請升級到 18 以上。" }
$nodePath = $nodeCommand.Source
Write-Ok "$nodeVersion（$nodePath）"

# --- 4. AutoHotkey v2 --------------------------------------------------------
Write-Step '檢查 AutoHotkey v2（讀取記錄與傳送訊息需要）'
$ahk = Get-Command autohotkey.exe -ErrorAction SilentlyContinue
if ($ahk) {
    Write-Ok "autohotkey.exe 可由 PATH 找到（$($ahk.Source)）"
} else {
    $programRoots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
    $candidates = foreach ($root in $programRoots) {
        foreach ($relative in @('AutoHotkey\v2\AutoHotkey.exe', 'AutoHotkey\AutoHotkey.exe')) {
            $candidate = Join-Path $root $relative
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { $candidate }
        }
    }

    if (-not $candidates) {
        Write-Warn 'PATH 與常見安裝位置都找不到 AutoHotkey v2。'
        Write-Warn '請由 https://www.autohotkey.com/ 安裝 v2 後重新執行；未安裝時歷史讀取與傳送工具無法運作。'
    } else {
        $ahkDir = Split-Path -Parent $candidates[0]
        Write-Warn "找到 AutoHotkey（$($candidates[0])），但 PATH 中沒有 autohotkey.exe。"
        if ($AddAhkToPath) {
            $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
            if ($userPath -notlike "*$ahkDir*") {
                [Environment]::SetEnvironmentVariable('Path', "$userPath;$ahkDir", 'User')
                Write-Ok "已將 $ahkDir 加入使用者 PATH（新開的終端機才會生效）。"
            } else {
                Write-Ok "$ahkDir 已在使用者 PATH 中。"
            }
            $env:Path = "$env:Path;$ahkDir"
        } else {
            Write-Warn "加上 -AddAhkToPath 可自動把 $ahkDir 加入使用者 PATH。"
        }
    }
}

# --- 5. LINE Desktop ---------------------------------------------------------
Write-Step '檢查 LINE Desktop'
if (Get-Process -Name LINE -ErrorAction SilentlyContinue) {
    Write-Ok 'LINE 正在執行'
} else {
    Write-Warn '目前沒有偵測到執行中的 LINE。使用工具前請先開啟並登入 LINE Desktop。'
}

# --- 6. CUA Driver（選配）----------------------------------------------------
Write-Step '檢查 CUA Driver（僅 UI 相依工具需要）'
$cuaResolved = ''
if ($CuaDriver) {
    if (-not [System.IO.Path]::IsPathRooted($CuaDriver)) { Fail "-CuaDriver 必須是絕對路徑：$CuaDriver" }
    if ([System.IO.Path]::GetExtension($CuaDriver).ToLowerInvariant() -ne '.exe') { Fail "-CuaDriver 必須指向 .exe：$CuaDriver" }
    if (-not (Test-Path -LiteralPath $CuaDriver -PathType Leaf)) { Fail "找不到檔案：$CuaDriver" }
    $cuaResolved = (Resolve-Path -LiteralPath $CuaDriver).Path.Replace('\', '/')
    Write-Ok $cuaResolved
} else {
    Write-Warn '未提供 -CuaDriver；UI 相依工具會回報 LINE_UI_BACKEND_UNAVAILABLE，其餘工具不受影響。'
}

# --- 7. npm install ----------------------------------------------------------
if ($SkipInstall) {
    Write-Step '略過 npm install（-SkipInstall）'
} else {
    Write-Step '安裝 npm 相依套件'
    Push-Location $InstallDir
    try {
        & npm install --ignore-scripts
        if ($LASTEXITCODE -ne 0) { Fail "npm install 失敗（exit code $LASTEXITCODE）。" }
        Write-Ok '相依套件安裝完成'
    } finally { Pop-Location }
}

if ($RunTests) {
    Write-Step '執行測試'
    Push-Location $InstallDir
    try {
        & npm test
        if ($LASTEXITCODE -ne 0) { Fail "npm test 失敗（exit code $LASTEXITCODE）。" }
        Write-Ok '測試通過'
    } finally { Pop-Location }
}

# --- 8. 產生設定 -------------------------------------------------------------
Write-Step '產生 MCP 用戶端設定'
$serverPath = $serverEntry.Replace('\', '/')
$expectedTools = if ($NoExtensions) { 5 } else { 24 }

$envPairs = [ordered]@{}
if (-not $NoExtensions) { $envPairs['LINE_MCP_EXTENSIONS'] = '1' }
if ($cuaResolved) { $envPairs['LINE_MCP_CUA_DRIVER'] = $cuaResolved }

switch ($Client) {
    'codex' {
        $arguments = @('mcp', 'add', 'line-desktop-mcp')
        foreach ($key in $envPairs.Keys) { $arguments += @('--env', "$key=$($envPairs[$key])") }
        $arguments += @('--', $nodePath.Replace('\', '/'), $serverPath)
        if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { Fail 'PATH 中找不到 codex CLI。' }
        Write-Host "   codex $($arguments -join ' ')" -ForegroundColor DarkGray
        & codex @arguments
        if ($LASTEXITCODE -ne 0) { Fail "codex mcp add 失敗（exit code $LASTEXITCODE）。" }
        Write-Ok '已加入 Codex；請重新連線讓它重讀工具清單。'
    }
    'claude-code' {
        $arguments = @('mcp', 'add', 'line-desktop-mcp')
        foreach ($key in $envPairs.Keys) { $arguments += @('--env', "$key=$($envPairs[$key])") }
        $arguments += @('--', $nodePath.Replace('\', '/'), $serverPath)
        if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { Fail 'PATH 中找不到 claude CLI。' }
        Write-Host "   claude $($arguments -join ' ')" -ForegroundColor DarkGray
        & claude @arguments
        if ($LASTEXITCODE -ne 0) { Fail "claude mcp add 失敗（exit code $LASTEXITCODE）。" }
        Write-Ok '已加入 Claude Code；請重啟 Claude Code 讓它重讀工具清單。'
    }
    default {
        $config = [ordered]@{
            mcpServers = [ordered]@{
                'line-desktop-mcp' = [ordered]@{
                    command = $nodePath.Replace('\', '/')
                    args    = @($serverPath)
                    env     = $envPairs
                }
            }
        }
        Write-Host '   將以下內容併入你的 MCP 用戶端設定檔：' -ForegroundColor DarkGray
        Write-Host ''
        ($config | ConvertTo-Json -Depth 6)
        Write-Host ''
    }
}

Write-Step '下一步'
Write-Host "   1. 重新連線 / 重啟 MCP 用戶端，讓它重新讀取工具清單。"
Write-Host "   2. 呼叫 get_line_capabilities({})，確認 toolCount 為 $expectedTools、platform 為 win32。"
Write-Host "      這個查詢不會讀取聊天室，也不會操作 LINE。"
Write-Host "   3. 使用說明見 docs/install-and-usage-zh-TW.md。"
Write-Host ''
