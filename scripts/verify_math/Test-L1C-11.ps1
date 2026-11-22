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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-11_tax_effect_advanced.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_dta_adj = 200000d * (0.30d - 0.25d)
$ex_dtl_adj = 100000d * (0.30d - 0.25d)
Assert-Equal 10000d $ex_dta_adj "Ex DTA Adj"
Assert-Equal 5000d $ex_dtl_adj "Ex DTL Adj"

# Q1
$q1_gross = 1000000d * 0.30d
$q1_net1 = 600000d * 0.30d
$q1_val1 = $q1_gross - $q1_net1
$q1_net2 = 800000d * 0.30d
$q1_diff = $q1_net2 - $q1_net1
Assert-Equal 300000d $q1_gross "Q1 Gross"
Assert-Equal 180000d $q1_net1 "Q1 Net1"
Assert-Equal 120000d $q1_val1 "Q1 Val1"
Assert-Equal 240000d $q1_net2 "Q1 Net2"
Assert-Equal 60000d $q1_diff "Q1 Diff"

# Q2
$q2_dtl_land = 200000d * 0.40d
$q2_dta_down = 100000d * 0.30d
$q2_dta_up = 100000d * 0.40d
$q2_nci = (100000d - $q2_dta_up) * 0.20d
Assert-Equal 80000d $q2_dtl_land "Q2 Land DTL"
Assert-Equal 30000d $q2_dta_down "Q2 Down DTA"
Assert-Equal 40000d $q2_dta_up "Q2 Up DTA"
Assert-Equal 12000d $q2_nci "Q2 NCI"

# Q3
$q3_etr = (0.20d * 1.15d + 0.10d) / 1.10d
Assert-Equal 0.30d $q3_etr "Q3 ETR"

foreach ($tok in @("10,000", "5,000", "180,000", "120,000", "240,000", "80,000", "30,000", "40,000", "12,000", "30.0%")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-11 CrossCheck $tok"
}

Write-Host "[Test-L1C-11] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0