param(
    [string]$RootDir = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = Split-Path -Parent $PSScriptRoot
}

Write-Host "=== Step 1/2: Building Typst PDFs ===" -ForegroundColor Cyan
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build_typst.ps1") -RootDir $RootDir
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host ""
Write-Host "=== Step 2/2: Building HTML Viewer Bundle ===" -ForegroundColor Cyan
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build_html.ps1") -RootDir $RootDir
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host ""
Write-Host "[ALL BUILD PASS] Typst PDF + HTML Web bundle are up to date." -ForegroundColor Green
exit 0
