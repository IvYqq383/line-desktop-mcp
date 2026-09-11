<#
.SYNOPSIS
    LINE Desktop MCP（Windows 社群版）安裝與設定腳本。

.DESCRIPTION
    檢查先決條件（Windows、Node.js 18+、AutoHotkey v2、LINE Desktop），
    安裝 npm 相依套件，並產生或註冊 MCP 用戶端設定。

    這個腳本不會安裝 Node.js、AutoHotkey 或 CUA Driver，也不會讀取聊天室或
    操作 LINE；它只做環境檢查、npm install 與設定輸出。重複執行是安全的。

.PARAMETER InstallDir
    line-desktop-mcp 原始碼所在目錄。預設為這個腳本的上層目錄。

.PARAMETER CuaDriver
    CUA Driver 執行檔的絕對路徑（必須是存在的 .exe）。
    未提供時，草稿與發送類工具會回報 LINE_UI_BACKEND_UNAVAILABLE。

.PARAMETER Client
    要設定的 MCP 用戶端，可指定多個：
      auto        自動偵測 PATH 上的 codex 與 claude，全部註冊；都沒有則退回 json
      json        僅印出通用 JSON 設定，不改動任何設定檔
      codex       執行 codex mcp add 完成註冊
      claude-code 執行 claude mcp add --scope user 完成註冊

.PARAMETER NoExtensions
    不啟用 LINE_MCP_EXTENSIONS=1，保留預設的 5 個工具。

.PARAMETER AddAhkToPath
    找到 AutoHotkey v2 但不在 PATH 時，將其目錄加入使用者 PATH。

.PARAMETER SkipInstall
    略過 npm install（相依套件已安裝時使用）。

.PARAMETER RunTests
    安裝後執行 npm test。

.EXAMPLE
    .\scripts\install-windows.ps1 -Client auto

.EXAMPLE
    .\scripts\install-windows.ps1 -Client codex,claude-code -CuaDriver C:\Tools\cua-driver\cua-driver.exe
#>
[CmdletBinding()]
param(
    [string]$InstallDir = (Split-Path -Parent $PSScriptRoot),
    [string]$CuaDriver = '',
    [ValidateSet('auto', 'json', 'codex', 'claude-code')]
    [string[]]$Client = @('json'),
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

<#
 執行外部指令並「只」回傳 exit code。

 兩個必要的細節：
 - 子行程的 stdout 必須用 Out-Host 送到主控台。若直接放著，它會流進本函式的
   success stream，呼叫端的 $code 就會變成「輸出各行 + exit code」的陣列，
   而 `$code -ne 0` 對陣列是「篩選」而非「比較」，成功也會被判成失敗。
 - 原生指令失敗不會丟例外，但 stderr 在 $ErrorActionPreference='Stop' 下可能
   被包成 NativeCommandError，所以這裡先把偏好值切成 Continue。
#>
function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$Quiet
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Quiet) {
            & $FilePath @Arguments 2>&1 | Out-Null
        } else {
            & $FilePath @Arguments | Out-Host
        }
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
}

# 讀取原生指令的 stdout（而非 exit code），同樣避開 NativeCommandError。
function Get-NativeOutput {
    param([Parameter(Mandatory)][string]$FilePath, [string[]]$Arguments = @())
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        return (& $FilePath @Arguments 2>&1 | Out-String)
    } finally {
        $ErrorActionPreference = $previous
    }
}

<#
 只有在能明確讀到主版號且小於 2 時才判定為 v1；讀不到版本資訊時視為通過，
 避免誤殺沒有版本資源的 v2 攜帶版。
#>
function Test-AhkV2 {
    param([Parameter(Mandatory)][string]$Path)
    try { $major = (Get-Item -LiteralPath $Path -ErrorAction Stop).VersionInfo.FileMajorPart }
    catch { return $true }
    if ($null -eq $major -or $major -eq 0) { return $true }
    return ($major -ge 2)
}

function Write-GenericJsonConfig {
    param(
        [Parameter(Mandatory)][string]$NodeForConfig,
        [Parameter(Mandatory)][string]$ServerPath,
        [Parameter(Mandatory)]$EnvPairs
    )
    $config = [ordered]@{
        mcpServers = [ordered]@{
            'line-desktop-mcp' = [ordered]@{
                command = $NodeForConfig
                args    = @($ServerPath)
                env     = $EnvPairs
            }
        }
    }
    Write-Host '   將以下內容併入你的 MCP 用戶端設定檔：' -ForegroundColor DarkGray
    Write-Host ''
    ($config | ConvertTo-Json -Depth 6)
    Write-Host ''
}

Write-Host 'LINE Desktop MCP - Windows 安裝腳本' -ForegroundColor White

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
if (-not (Test-Path -LiteralPath $serverEntry -PathType Leaf)) {
    Fail "在 $InstallDir 找不到 src\server.js，請確認 -InstallDir 指向 line-desktop-mcp 原始碼根目錄。"
}
Write-Ok $InstallDir

# --- 3. Node.js --------------------------------------------------------------
Write-Step '檢查 Node.js（需要 18 以上）'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { Fail 'PATH 中找不到 node，請先安裝 Node.js 18 以上：https://nodejs.org/' }
$nodeVersionRaw = (Get-NativeOutput -FilePath $nodeCommand.Source -Arguments @('-v')).Trim()
if ($nodeVersionRaw -notmatch 'v(\d+)\.') { Fail "無法解析 node -v 的輸出：$nodeVersionRaw" }
$nodeMajor = [int]$Matches[1]
if ($nodeMajor -lt 18) { Fail "Node.js 版本為 $nodeVersionRaw，請升級到 18 以上。" }
$nodePath = $nodeCommand.Source
Write-Ok "$nodeVersionRaw（$nodePath）"

# --- 4. AutoHotkey v2 --------------------------------------------------------
Write-Step '檢查 AutoHotkey v2（讀取／搜尋／匯出聊天記錄需要）'
$ahk = Get-Command autohotkey.exe -ErrorAction SilentlyContinue
if ($ahk -and -not (Test-AhkV2 $ahk.Source)) {
    $ahkVersion = (Get-Item -LiteralPath $ahk.Source).VersionInfo.FileVersion
    Write-Warn "PATH 上的 $($ahk.Source) 是 AutoHotkey v$ahkVersion，不是 v2；請由 https://www.autohotkey.com/ 安裝 v2。"
    $ahk = $null
}

if ($ahk) {
    Write-Ok "autohotkey.exe 可由 PATH 找到（$($ahk.Source)）"
} else {
    $programRoots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA) | Where-Object { $_ }
    $relativePaths = @(
        'AutoHotkey\v2\AutoHotkey.exe',
        'AutoHotkey\v2\AutoHotkey64.exe',
        'AutoHotkey\v2\AutoHotkey32.exe',
        'AutoHotkey\AutoHotkey.exe',
        'Programs\AutoHotkey\v2\AutoHotkey.exe',
        'Programs\AutoHotkey\AutoHotkey.exe'
    )
    $candidates = foreach ($root in $programRoots) {
        foreach ($relative in $relativePaths) {
            $candidate = Join-Path $root $relative
            if ((Test-Path -LiteralPath $candidate -PathType Leaf) -and (Test-AhkV2 $candidate)) { $candidate }
        }
    }
    $candidates = @($candidates)

    if ($candidates.Count -eq 0) {
        Write-Warn 'PATH 與常見安裝位置都找不到 AutoHotkey v2。'
        Write-Warn '請由 https://www.autohotkey.com/ 安裝 v2 後重新執行；未安裝時記錄讀取類工具無法運作。'
    } else {
        $ahkDir = Split-Path -Parent $candidates[0]
        Write-Warn "找到 AutoHotkey v2（$($candidates[0])），但 PATH 中沒有 autohotkey.exe。"
        if ($AddAhkToPath) {
            # 直接讀寫登錄以保留 REG_EXPAND_SZ 型別與未展開的 %VAR%：
            # [Environment]::GetEnvironmentVariable 會先展開，SetEnvironmentVariable 會寫成 REG_SZ，
            # 那會把使用者 PATH 中的 %USERPROFILE% 這類項目永久寫死。
            $envKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
            if (-not $envKey) { $envKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment') }
            try {
                $rawPath = $envKey.GetValue('Path', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
                if ($null -eq $rawPath) {
                    $userPath = ''
                    $pathKind = [Microsoft.Win32.RegistryValueKind]::ExpandString
                } else {
                    $userPath = [string]$rawPath
                    $pathKind = $envKey.GetValueKind('Path')
                }
                $ahkDirNormalized = $ahkDir.TrimEnd('\')
                # 比對時才展開，避免 %LOCALAPPDATA%\... 這類寫法被誤判為不存在而重複附加。
                $alreadyListed = $userPath -split ';' | Where-Object {
                    $_ -and (([Environment]::ExpandEnvironmentVariables($_)).TrimEnd('\') -ieq $ahkDirNormalized)
                }
                if (-not $alreadyListed) {
                    $trimmed = $userPath.TrimEnd(';')
                    $updated = if ($trimmed) { "$trimmed;$ahkDir" } else { $ahkDir }
                    $envKey.SetValue('Path', $updated, $pathKind)
                    Write-Ok "已將 $ahkDir 加入使用者 PATH（新開的終端機才會生效）。"
                } else {
                    Write-Ok "$ahkDir 已在使用者 PATH 中。"
                }
            } finally {
                if ($envKey) { $envKey.Dispose() }
            }
            $env:Path = "$env:Path;$ahkDir"
            if (-not (Get-Command autohotkey.exe -ErrorAction SilentlyContinue)) {
                Write-Warn "$ahkDir 下的執行檔名稱不是 autohotkey.exe；LINE 自動化需要 autohotkey.exe 能由 PATH 找到，請自行建立同名複本或捷徑。"
            }
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

# --- 6. CUA Driver -----------------------------------------------------------
Write-Step '檢查 CUA Driver（草稿、發送、附件與面板類工具需要）'
$cuaResolved = ''
if ($CuaDriver) {
    if ($CuaDriver -ne $CuaDriver.Trim()) { Fail '-CuaDriver 前後不能有空白。' }
    if (-not [System.IO.Path]::IsPathRooted($CuaDriver)) { Fail "-CuaDriver 必須是絕對路徑：$CuaDriver" }
    if ([System.IO.Path]::GetExtension($CuaDriver).ToLowerInvariant() -ne '.exe') { Fail "-CuaDriver 必須指向 .exe：$CuaDriver" }
    if (-not (Test-Path -LiteralPath $CuaDriver -PathType Leaf)) { Fail "找不到檔案：$CuaDriver" }
    $cuaResolved = (Resolve-Path -LiteralPath $CuaDriver).Path.Replace('\', '/')
    Write-Ok $cuaResolved
} elseif (-not $NoExtensions) {
    Write-Warn '未提供 -CuaDriver。24 個工具中有 15 個會回報 LINE_UI_BACKEND_UNAVAILABLE，'
    Write-Warn '包含所有草稿與發送工具（send_message_auto、send_message_manual、set_line_draft…）。'
    Write-Warn '仍可使用的是記錄讀取、搜尋、驗證、匯出與能力查詢這 9 個工具。'
}

# --- 7. npm install ----------------------------------------------------------
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) { $npmCommand = Get-Command npm -ErrorAction SilentlyContinue }

if ($SkipInstall) {
    Write-Step '略過 npm install（-SkipInstall）'
} else {
    Write-Step '安裝 npm 相依套件'
    if (-not $npmCommand) { Fail 'PATH 中找不到 npm；請重新安裝 Node.js（內含 npm）。' }
    Push-Location -LiteralPath $InstallDir
    try {
        $code = Invoke-Native -FilePath $npmCommand.Source -Arguments @('install', '--ignore-scripts')
        if ($code -ne 0) { Fail "npm install 失敗（exit code $code）。" }
        Write-Ok '相依套件安裝完成'
    } finally { Pop-Location }
}

if ($RunTests) {
    Write-Step '執行測試'
    if (-not $npmCommand) { Fail 'PATH 中找不到 npm，無法執行測試。' }
    Push-Location -LiteralPath $InstallDir
    try {
        $code = Invoke-Native -FilePath $npmCommand.Source -Arguments @('test')
        if ($code -ne 0) { Fail "npm test 失敗（exit code $code）。" }
        Write-Ok '測試通過'
    } finally { Pop-Location }
}

# --- 8. 決定要設定哪些用戶端 -------------------------------------------------
Write-Step '決定 MCP 用戶端'
$targets = [System.Collections.Generic.List[string]]::new()
foreach ($requested in $Client) {
    if ($requested -ne 'auto') { $targets.Add($requested); continue }

    $detected = @()
    if (Get-Command codex -ErrorAction SilentlyContinue) { $detected += 'codex' }
    if (Get-Command claude -ErrorAction SilentlyContinue) { $detected += 'claude-code' }
    if ($detected.Count -eq 0) {
        Write-Warn 'PATH 上沒有偵測到 codex 或 claude CLI，改為印出通用 JSON 設定。'
        $targets.Add('json')
    } else {
        Write-Ok "偵測到：$($detected -join '、')"
        foreach ($item in $detected) { $targets.Add($item) }
    }
}
$targets = @($targets | Select-Object -Unique)

# --- 9. 產生 / 註冊設定 ------------------------------------------------------
$serverPath = $serverEntry.Replace('\', '/')
$nodeForConfig = $nodePath.Replace('\', '/')

$envPairs = [ordered]@{}
if (-not $NoExtensions) { $envPairs['LINE_MCP_EXTENSIONS'] = '1' }
if ($cuaResolved) { $envPairs['LINE_MCP_CUA_DRIVER'] = $cuaResolved }

function Register-LineMcp {
    param(
        [Parameter(Mandatory)][string]$Cli,
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][string]$NodeForConfig,
        [Parameter(Mandatory)][string]$ServerPath,
        [Parameter(Mandatory)]$EnvPairs,
        [string[]]$ScopeArgs = @()
    )

    $resolved = Get-Command $Cli -ErrorAction SilentlyContinue
    if (-not $resolved) {
        Write-Warn "PATH 中找不到 $Cli CLI，略過 $DisplayName 註冊。"
        return $false
    }

    # 已存在同名 server 時先移除，讓重複執行不會失敗。
    $existing = Invoke-Native -FilePath $resolved.Source -Arguments @('mcp', 'get', 'line-desktop-mcp') -Quiet
    if ($existing -eq 0) {
        Write-Warn "$DisplayName 已有名為 line-desktop-mcp 的設定，將以這次的路徑覆蓋。"
        # 只移除這個腳本會寫入的 scope，不動使用者自行設定的其他 scope。
        Invoke-Native -FilePath $resolved.Source -Arguments (@('mcp', 'remove') + $ScopeArgs + @('line-desktop-mcp')) -Quiet | Out-Null
    }

    $arguments = @('mcp', 'add') + $ScopeArgs + @('line-desktop-mcp')
    foreach ($key in $EnvPairs.Keys) { $arguments += @('--env', "$key=$($EnvPairs[$key])") }
    $arguments += @('--', $NodeForConfig, $ServerPath)

    Write-Host "   $Cli $($arguments -join ' ')" -ForegroundColor DarkGray
    $code = Invoke-Native -FilePath $resolved.Source -Arguments $arguments
    if ($code -ne 0) {
        Write-Warn "$DisplayName 註冊失敗（exit code $code）。"
        return $false
    }
    Write-Ok "已加入 $DisplayName"
    return $true
}

$registered = @()
$jsonPrinted = $false
foreach ($target in $targets) {
    switch ($target) {
        'codex' {
            Write-Step '註冊到 Codex CLI'
            if (Register-LineMcp -Cli 'codex' -DisplayName 'Codex CLI' -NodeForConfig $nodeForConfig -ServerPath $serverPath -EnvPairs $envPairs) {
                $registered += 'Codex CLI'
            }
        }
        'claude-code' {
            Write-Step '註冊到 Claude Code'
            # claude mcp add 預設是 local scope（只對當前目錄生效），必須指定 user 才會全域可用。
            if (Register-LineMcp -Cli 'claude' -DisplayName 'Claude Code' -NodeForConfig $nodeForConfig -ServerPath $serverPath -EnvPairs $envPairs -ScopeArgs @('--scope', 'user')) {
                $registered += 'Claude Code'
            }
        }
        'json' {
            Write-Step '通用 JSON 設定'
            Write-GenericJsonConfig -NodeForConfig $nodeForConfig -ServerPath $serverPath -EnvPairs $envPairs
            $jsonPrinted = $true
        }
    }
}

if ($registered.Count -eq 0 -and -not $jsonPrinted) {
    Write-Step '通用 JSON 設定（沒有完成任何註冊，請改用手動設定）'
    Write-GenericJsonConfig -NodeForConfig $nodeForConfig -ServerPath $serverPath -EnvPairs $envPairs
    $jsonPrinted = $true
}

# --- 10. 下一步 --------------------------------------------------------------
Write-Step '下一步'
if ($registered.Count -gt 0) {
    Write-Host "   1. 重新連線 / 重啟：$($registered -join '、')，讓它重新讀取工具清單。"
} else {
    Write-Host '   1. 把上面的 JSON 併入 MCP 用戶端設定，然後重啟該用戶端。'
}
if ($NoExtensions) {
    Write-Host '   2. 確認用戶端的工具清單有 5 個工具（預設介面，不含 get_line_capabilities）。'
} else {
    Write-Host '   2. 請 AI 呼叫 get_line_capabilities，確認 toolCount 為 24、platform 為 win32。'
    Write-Host '      查不到這個工具，表示還在 5 個工具的預設模式，請檢查 LINE_MCP_EXTENSIONS 是否為 1。'
}
Write-Host '   3. 使用說明見 docs/install-and-usage-zh-TW.md。'
Write-Host ''
