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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "02_level2_commercial\L2C-09_net_assets_and_ss.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_rem = (8000000d / 4d) - (1200000d + 700000d)
$ex_res = [Math]::Min(1500000d * 0.1d, $ex_rem)
$ex_gw = 3000000d - (4000000d - 1500000d)
Assert-Equal 100000d $ex_res "Ex Legal Reserve"
Assert-Equal 500000d $ex_gw "Ex Goodwill"

# Q1
$q1_rem = (4000000d / 4d) - (650000d + 320000d)
$q1_res = [Math]::Min(600000d * 0.1d, $q1_rem)
$q1_gw = 1800000d - (2200000d - 700000d)
Assert-Equal 30000d $q1_res "Q1 Reserve"
Assert-Equal 300000d $q1_gw "Q1 Goodwill"

# Q2
$q2_end_re = 800000d - 440000d + 950000d
$q2_end_eq = 7000000d + 2000000d - 400000d + 950000d
Assert-Equal 1310000d $q2_end_re "Q2 End RE"
Assert-Equal 9550000d $q2_end_eq "Q2 End Equity"

# Q3
$q3_rem = (4000000d / 4d) - (610000d + 300000d)
$q3_cap_res = ($q3_rem * 400000d) / 1200000d
$q3_leg_res = ($q3_rem * 800000d) / 1200000d
$q3_neg_gw = (2500000d - 700000d) - 1500000d
Assert-Equal 30000d $q3_cap_res "Q3 Cap Reserve"
Assert-Equal 60000d $q3_leg_res "Q3 Leg Reserve"
Assert-Equal 300000d $q3_neg_gw "Q3 Neg Goodwill"

foreach ($tok in @("5,000,000", "500,000", "2,000,000", "300,000", "1,310,000", "9,550,000", "60,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2C-09 CrossCheck $tok"
}

Write-Host "[Test-L2C-09] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
