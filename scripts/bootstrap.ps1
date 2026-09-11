<#
.SYNOPSIS
    一行指令完成 LINE Desktop MCP 的取得、安裝與 MCP 用戶端註冊。

.DESCRIPTION
    取得原始碼（git clone，沒有 git 時改下載 zip）、執行 scripts\install-windows.ps1，
    並自動偵測 PATH 上的 codex 與 claude CLI 完成註冊。重複執行會更新既有安裝。

    這個腳本不會安裝 Node.js、AutoHotkey 或 CUA Driver，也不會讀取聊天室或操作 LINE。

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
    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/IvYqq383/line-desktop-mcp/main/scripts/bootstrap.ps1)))

.EXAMPLE
    .\scripts\bootstrap.ps1 -CuaDriver C:\Tools\cua-driver\cua-driver.exe -RunTests
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

function Invoke-Native {
    param([Parameter(Mandatory)][string]$FilePath, [string[]]$Arguments = @())
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $FilePath @Arguments
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

# --- 取得原始碼 --------------------------------------------------------------
Write-Step "取得原始碼到 $InstallDir"
$git = Get-Command git -ErrorAction SilentlyContinue
$parent = Split-Path -Parent $InstallDir
if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
}

$hasCheckout = Test-Path -LiteralPath (Join-Path $InstallDir 'src\server.js') -PathType Leaf
$isGitRepo = Test-Path -LiteralPath (Join-Path $InstallDir '.git')

if ($isGitRepo -and $git) {
    Write-Ok '已存在 git checkout，改為更新'
    Push-Location $InstallDir
    try {
        $code = Invoke-Native -FilePath $git.Source -Arguments @('fetch', 'origin', $Ref)
        if ($code -ne 0) { Fail "git fetch 失敗（exit code $code）。" }
        $code = Invoke-Native -FilePath $git.Source -Arguments @('checkout', '-B', $Ref, "origin/$Ref")
        if ($code -ne 0) { Fail "git checkout 失敗（exit code $code）；若本機有未提交的修改，請先處理。" }
        Write-Ok "已更新到 origin/$Ref"
    } finally { Pop-Location }
} elseif (Test-Path -LiteralPath $InstallDir) {
    if ($hasCheckout) {
        Write-Warn "$InstallDir 已有原始碼但不是 git checkout，沿用現有檔案（不會覆寫）。"
    } else {
        $existing = @(Get-ChildItem -LiteralPath $InstallDir -Force -ErrorAction SilentlyContinue)
        if ($existing.Count -gt 0) {
            Fail "$InstallDir 已存在且不是 line-desktop-mcp 的原始碼；請改用 -InstallDir 指定其他空目錄。"
        }
        Remove-Item -LiteralPath $InstallDir -Force
        $hasCheckout = $false
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $InstallDir 'src\server.js') -PathType Leaf)) {
    if ($git) {
        $code = Invoke-Native -FilePath $git.Source -Arguments @('clone', '--branch', $Ref, '--depth', '1', "https://github.com/$Repo.git", $InstallDir)
        if ($code -ne 0) { Fail "git clone 失敗（exit code $code）。" }
        Write-Ok "已 clone $Repo（$Ref）"
    } else {
        Write-Warn 'PATH 中找不到 git，改為下載 zip。'
        $tempZip = Join-Path ([System.IO.Path]::GetTempPath()) "line-desktop-mcp-$([System.Guid]::NewGuid().ToString('N')).zip"
        $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "line-desktop-mcp-$([System.Guid]::NewGuid().ToString('N'))"
        try {
            Invoke-WebRequest -Uri "https://codeload.github.com/$Repo/zip/refs/heads/$Ref" -OutFile $tempZip -UseBasicParsing
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

& $installer @installerArgs
