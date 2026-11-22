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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "01_level3\L3-07_accruals_deferrals_and_supplies.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_prepaid = (120000d * 6d) / 12d
$ex_accrued_int = (1200000d * 0.03d * 5d) / 12d
$ex_unearned = (180000d * 2d) / 6d
$ex_accrued_rev = (800000d * 0.03d * 9d) / 12d
Assert-Equal 60000d $ex_prepaid "Ex Prepaid"
Assert-Equal 15000d $ex_accrued_int "Ex Accrued Int"
Assert-Equal 60000d $ex_unearned "Ex Unearned"
Assert-Equal 18000d $ex_accrued_rev "Ex Accrued Rev"

# Q1
$q1_prepaid = (360000d * 4d) / 12d
$q1_accrued_int = (2400000d * 0.02d * 4d) / 12d
$q1_unearned = (240000d * 9d) / 12d
$q1_accrued_rev = (1000000d * 0.036d * 6d) / 12d
Assert-Equal 120000d $q1_prepaid "Q1 Prepaid"
Assert-Equal 16000d $q1_accrued_int "Q1 Accrued Int"
Assert-Equal 180000d $q1_unearned "Q1 Unearned"
Assert-Equal 18000d $q1_accrued_rev "Q1 Accrued Rev"

# Q2
$q2_pre_ins = 330000d
$q2_end_prepaid = (240000d * 6d) / 12d
$q2_pl_ins = $q2_pre_ins - $q2_end_prepaid
$q2_pre_fee = 75000d
$q2_end_accrued_fee = (300000d * 9d) / 12d
$q2_pl_fee = $q2_pre_fee + $q2_end_accrued_fee
Assert-Equal 120000d $q2_end_prepaid "Q2 End Prepaid"
Assert-Equal 210000d $q2_pl_ins "Q2 PL Ins"
Assert-Equal 225000d $q2_end_accrued_fee "Q2 End Accrued Fee"
Assert-Equal 300000d $q2_pl_fee "Q2 PL Fee"

# Q3
$q3_rent_adj = 160000d - 80000d
$q3_pl_rent = 240000d - $q3_rent_adj
$q3_int_adj = 30000d - 25000d
$q3_pl_int = 60000d + $q3_int_adj
$q3_distort = 80000d - 25000d
Assert-Equal 80000d $q3_rent_adj "Q3 Rent Adj"
Assert-Equal 160000d $q3_pl_rent "Q3 PL Rent"
Assert-Equal 5000d $q3_int_adj "Q3 Int Adj"
Assert-Equal 65000d $q3_pl_int "Q3 PL Int"
Assert-Equal 55000d $q3_distort "Q3 Profit Distortion"

foreach ($tok in @("15,000", "120,000", "16,000", "180,000", "210,000", "225,000", "300,000", "65,000", "55,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L3-07 CrossCheck $tok"
}

Write-Host "[Test-L3-07] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
