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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "05_level1_industrial\L1I-06_budgeting_and_variance_analysis.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_p = (520d - 500d) * 10800d
$ex_mkt = 500d * (120000d - 100000d) * 0.10d
$ex_shr = 500d * 120000d * (0.09d - 0.10d)
Assert-Equal 216000d $ex_p "Ex Price"
Assert-Equal 1000000d $ex_mkt "Ex Mkt"
Assert-Equal (-600000d) $ex_shr "Ex Shr"

# Q1
$q1_bud = (600d * 600d) + (400d * 400d)
$q1_std_mix = 1200d * 520d
$q1_act_mix = (550d * 600d) + (650d * 400d)
$q1_mix = $q1_act_mix - $q1_std_mix
$q1_qty = $q1_std_mix - $q1_bud
Assert-Equal (-34000d) $q1_mix "Q1 Mix"
Assert-Equal 104000d $q1_qty "Q1 Qty"

# Q2
$q2_apr = 200000d + (1000000d * 0.40d + 800000d * 0.60d) - (500000d * 0.50d + 400000d * 0.50d) - 300000d
$q2_may = $q2_apr + (1200000d * 0.40d + 1000000d * 0.60d) - (600000d * 0.50d + 500000d * 0.50d) - 300000d
Assert-Equal 330000d $q2_apr "Q2 Apr"
Assert-Equal 560000d $q2_may "Q2 May"

# Q3
$q3_fix = 500000d - 580000d
$q3_flex = (1200d * 500d) - 580000d
Assert-Equal (-80000d) $q3_fix "Q3 Fix"
Assert-Equal 20000d $q3_flex "Q3 Flex"

foreach ($tok in @("5,616,000", "1,000,000", "600,000", "34,000", "104,000", "330,000", "560,000", "80,000", "20,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1I-06 CrossCheck $tok"
}

Write-Host "[Test-L1I-06] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0