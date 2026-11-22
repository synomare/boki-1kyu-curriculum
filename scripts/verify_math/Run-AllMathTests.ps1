[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$testFiles = Get-ChildItem -Path $PSScriptRoot -Filter "Test-*.ps1" | Sort-Object Name
$passedSuites = 0
$failedSuites = 0

foreach ($tf in $testFiles) {
    Write-Host "Running $($tf.Name)..." -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -File $tf.FullName
    if ($LASTEXITCODE -eq 0) {
        $passedSuites++
    } else {
        $failedSuites++
    }
}

Write-Host ""
Write-Host "=== MATH VERIFICATION SUMMARY ===" -ForegroundColor Cyan
Write-Host "Suites Passed : $passedSuites"
Write-Host "Suites Failed : $failedSuites"

if ($failedSuites -gt 0 -or $passedSuites -eq 0) {
    exit 1
}
exit 0
