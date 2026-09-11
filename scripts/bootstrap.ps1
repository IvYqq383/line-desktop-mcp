<#
.SYNOPSIS
    一行指令完成 LINE Desktop MCP 的取得、安裝與 MCP 用戶端註冊。

.DESCRIPTION
    取得原始碼（git clone，沒有 git 時改下載 zip）、執行 scripts\install-windows.ps1，
    並自動偵測 PATH 上的 codex 與 claude CLI 完成註冊。重複執行會更新既有安裝。

    這個腳本不會安裝 Node.js、AutoHotkey 或 CUA Driver，也不會讀取聊天室或操作 LINE。
    更新既有 checkout 時只做快轉；有本機 commit 或未提交的修改就會停下來，不會覆寫。

.PARAMETER InstallDir
    安裝目標目錄，預設 C:\Tools\line-desktop-mcp。

.PARAMETER Ref
    要取得的 git 分支或 tag。

.PARAMETER Repo
    來源 repository（owner/repo）。

.PARAMETER CuaDriver
    CUA Driver 執行檔的絕對路徑，會轉交給安裝腳本。

.PARAMETER Client
    要設定的 MCP 用戶端，預設 auto（偵測 codex 與 claude，都沒有則印出 JSON）。

.PARAMETER NoExtensions
    保留預設的 5 個工具，不啟用 24 個。

.PARAMETER RunTests
    安裝後執行 npm test。

.EXAMPLE
    # 一行安裝。先下載再以 -File 執行，而不是 [scriptblock]::Create((irm ...))：
    # 本檔含 UTF-8 BOM（Windows PowerShell 5.1 需要它才不會用 ANSI 代碼頁誤讀中文），
    # 而 irm 回傳的字串若保留 BOM，scriptblock 會在第一個 token 就解析失敗。
    irm https://raw.githubusercontent.com/IvYqq383/line-desktop-mcp/main/scripts/bootstrap.ps1 -OutFile "$env:TEMP\line-mcp-bootstrap.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\line-mcp-bootstrap.ps1"

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "$env:TEMP\line-mcp-bootstrap.ps1" -CuaDriver C:\Tools\cua-driver\cua-driver.exe
#>
[CmdletBinding()]
param(
    [string]$InstallDir = 'C:\Tools\line-desktop-mcp',
    [string]$Ref = 'main',
    [string]$Repo = 'IvYqq383/line-desktop-mcp',
    [string]$CuaDriver = '',
    [ValidateSet('auto', 'json', 'codex', 'claude-code')]
    [string[]]$Client = @('auto'),
    [switch]$NoExtensions,
    [switch]$RunTests
)

$ErrorActionPreference = 'Stop'

function Write-Step { param([string]$Message) Write-Host "`n== $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "   [OK] $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "   [!]  $Message" -ForegroundColor Yellow }
function Fail       { param([string]$Message) Write-Host "   [X]  $Message" -ForegroundColor Red; exit 1 }

# 子行程的 stdout 必須導向主控台，否則會混進本函式的回傳值，
# 讓呼叫端的 `$code -ne 0` 變成陣列篩選而把成功判成失敗。
function Invoke-Native {
    param([Parameter(Mandatory)][string]$FilePath, [string[]]$Arguments = @())
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $FilePath @Arguments | Out-Host
        return $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
}

Write-Host 'LINE Desktop MCP - 一鍵安裝' -ForegroundColor White

# --- 平台 --------------------------------------------------------------------
Write-Step '檢查作業系統'
$isWindowsHost = $true
if (Get-Variable -Name IsWindows -Scope Global -ErrorAction SilentlyContinue) { $isWindowsHost = $IsWindows }
if (-not $isWindowsHost) { Fail '這個腳本只能在 Windows 執行。' }
if ($Repo -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { Fail "-Repo 格式應為 owner/repo：$Repo" }
Write-Ok 'Windows'

# 以 irm + scriptblock 執行時本身不受執行原則限制，但稍後要執行磁碟上的
# install-windows.ps1，而 Windows PowerShell 5.1 用戶端預設是 Restricted。
# -Scope Process 只影響目前這個行程，不需要系統管理員權限，關掉視窗即失效。
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction SilentlyContinue

# --- 取得原始碼 --------------------------------------------------------------
Write-Step "取得原始碼到 $InstallDir"
$git = Get-Command git -ErrorAction SilentlyContinue
$parent = Split-Path -Parent $InstallDir
if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
}

$hasCheckout = Test-Path -LiteralPath (Join-Path $InstallDir 'src\server.js') -PathType Leaf
$isGitRepo = Test-Path -LiteralPath (Join-Path $InstallDir '.git')

if ($isGitRepo -and $hasCheckout -and $git) {
    Write-Ok '已存在 checkout，改為更新'
    Push-Location -LiteralPath $InstallDir
    try {
        # fetch 會把分支與 tag 一律解析到 FETCH_HEAD，所以不必依賴 remote-tracking
        # 分支（--depth 1 的 clone 是 single-branch，origin/<其他 ref> 並不存在）。
        $code = Invoke-Native -FilePath $git.Source -Arguments @('fetch', 'origin', $Ref)
        if ($code -ne 0) { Fail "git fetch 失敗（exit code $code）；請確認 -Ref '$Ref' 在 $Repo 中存在。" }

        # 只在本機沒有領先的 commit 時才移動 HEAD，避免無聲丟掉別人的工作。
        $ancestor = Invoke-Native -FilePath $git.Source -Arguments @('merge-base', '--is-ancestor', 'HEAD', 'FETCH_HEAD')
        if ($ancestor -ne 0) {
            Fail "$InstallDir 有未推送的本機 commit（或狀態無法判斷），不會覆寫。請先處理（git log FETCH_HEAD..HEAD），或改用 -InstallDir 指定其他目錄。"
        }

        $code = Invoke-Native -FilePath $git.Source -Arguments @('checkout', '--detach', 'FETCH_HEAD')
        if ($code -ne 0) { Fail "git checkout 失敗（exit code $code）；若有未提交的修改請先處理，或刪除 $InstallDir 後重新執行。" }
        Write-Ok "已更新到 $Ref"
    } finally { Pop-Location }
} elseif (Test-Path -LiteralPath $InstallDir) {
    if ($hasCheckout) {
        Write-Warn "$InstallDir 已有原始碼但不是可更新的 git checkout，沿用現有檔案（不會覆寫）。"
    } else {
        $existing = @(Get-ChildItem -LiteralPath $InstallDir -Force -ErrorAction SilentlyContinue)
        if ($existing.Count -gt 0) {
            Fail "$InstallDir 已存在且不是 line-desktop-mcp 的原始碼；請改用 -InstallDir 指定其他空目錄。"
        }
        Remove-Item -LiteralPath $InstallDir -Recurse -Force
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $InstallDir 'src\server.js') -PathType Leaf)) {
    if ($git) {
        $code = Invoke-Native -FilePath $git.Source -Arguments @('clone', '--branch', $Ref, '--depth', '1', "https://github.com/$Repo.git", $InstallDir)
        if ($code -ne 0) { Fail "git clone 失敗（exit code $code）；請確認 -Ref '$Ref' 在 $Repo 中存在。" }
        Write-Ok "已 clone $Repo（$Ref）"
    } else {
        Write-Warn 'PATH 中找不到 git，改為下載 zip。'
        $tempZip = Join-Path ([System.IO.Path]::GetTempPath()) "line-desktop-mcp-$([System.Guid]::NewGuid().ToString('N')).zip"
        $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "line-desktop-mcp-$([System.Guid]::NewGuid().ToString('N'))"
        try {
            # -Ref 可能是分支或 tag，兩者的 codeload 路徑不同，依序嘗試。
            $downloaded = $false
            foreach ($refPrefix in @('refs/heads', 'refs/tags')) {
                try {
                    Invoke-WebRequest -Uri "https://codeload.github.com/$Repo/zip/$refPrefix/$Ref" -OutFile $tempZip -UseBasicParsing
                    $downloaded = $true
                    break
                } catch {
                    Write-Warn "$refPrefix/$Ref 下載失敗，嘗試下一種 ref 形式。"
                }
            }
            if (-not $downloaded) { Fail "無法下載 $Repo 的 '$Ref'；請確認分支或 tag 名稱正確，或安裝 git 後重試。" }

            Expand-Archive -LiteralPath $tempZip -DestinationPath $tempDir -Force
            $extracted = @(Get-ChildItem -LiteralPath $tempDir -Directory)
            if ($extracted.Count -ne 1) { Fail '下載的 zip 結構不如預期。' }
            New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
            Copy-Item -Path (Join-Path $extracted[0].FullName '*') -Destination $InstallDir -Recurse -Force
            Write-Ok "已下載並解壓 $Repo（$Ref）"
        } finally {
            Remove-Item -LiteralPath $tempZip -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

$installer = Join-Path $InstallDir 'scripts\install-windows.ps1'
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    Fail "取得的原始碼中沒有 scripts\install-windows.ps1；請確認 -Ref '$Ref' 這個分支含有安裝腳本。"
}

# --- 交給安裝腳本 ------------------------------------------------------------
Write-Step '執行安裝腳本'
$installerArgs = @{
    InstallDir = $InstallDir
    Client     = $Client
}
if ($CuaDriver) { $installerArgs['CuaDriver'] = $CuaDriver }
if ($NoExtensions) { $installerArgs['NoExtensions'] = $true }
if ($RunTests) { $installerArgs['RunTests'] = $true }

try {
    & $installer @installerArgs
} catch [System.Management.Automation.PSSecurityException] {
    # 執行原則被群組原則鎖在 MachinePolicy/UserPolicy 時，Process scope 蓋不過去。
    Fail "PowerShell 執行原則封鎖了安裝腳本。請改執行：powershell -ExecutionPolicy Bypass -File `"$installer`" -Client $($Client -join ',')"
}
