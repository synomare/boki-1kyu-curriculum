[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$script:Passed = 0
$script:Failed = 0

function Assert-Equal {
    param([decimal]$Expected, [decimal]$Actual, [string]$Label)
    if ($Expected -eq $Actual) { $script:Passed++ }
    else { $script:Failed++; Write-Host "  [FAIL] $Label : Expected=$Expected, Actual=$Actual" -ForegroundColor Red }
}

function Assert-Contains {
    param([string]$Text, [string]$Token, [string]$Label)
    if ($Text.Contains($Token)) { $script:Passed++ }
    else { $script:Failed++; Write-Host "  [FAIL] $Label : Missing '$Token'" -ForegroundColor Red }
}

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "05_level1_industrial\L1I-05_advanced_cvp_and_product_mix.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_wcr = (0.60d * 0.50d) + (0.40d * 0.50d)
$ex_bep = 3000000d / $ex_wcr
Assert-Equal 0.50d $ex_wcr "Ex WCR"
Assert-Equal 6000000d $ex_bep "Ex BEP"

# Q1
$q1_x_h = 3000d / 2d
$q1_y_h = 4800d / 4d
$q1_max = (400d * 3000d) + (100d * 4800d)
Assert-Equal 1500d $q1_x_h "Q1 X/h"
Assert-Equal 1200d $q1_y_h "Q1 Y/h"
Assert-Equal 1680000d $q1_max "Q1 Max"

# Q2
$q2_z = (500d * 300d) + (400d * 200d)
$q2_dual = (800d * 200d) + (700d * 100d)
Assert-Equal 230000d $q2_z "Q2 LP"
Assert-Equal 230000d $q2_dual "Q2 Dual"

# Q3
$q3_ctrl = 400000d - 250000d
$q3_seg = $q3_ctrl - 50000d
Assert-Equal 150000d $q3_ctrl "Q3 Ctrl"
Assert-Equal 100000d $q3_seg "Q3 Seg"

foreach ($tok in @("6,000,000", "1,680,000", "230,000", "150,000", "100,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1I-05 CrossCheck $tok"
}

Write-Host "[Test-L1I-05] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0