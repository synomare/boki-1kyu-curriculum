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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-13_consolidation_capital_and_equity_method.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_step = 360000d - 300000d
$ex_gw = (360000d + 480000d) - (1000000d * 0.70d)
Assert-Equal 60000d $ex_step "Ex Step Gain"
Assert-Equal 140000d $ex_gw "Ex GW"

# Q1
$q1_surp = (1000000d * 0.20d) - 230000d
Assert-Equal (-30000d) $q1_surp "Q1 Cap Surp"

# Q2
$q2a_surp = 250000d - (1000000d * 0.20d)
$q2b_cost = (1000000d * 0.50d) + ((80000d * 50d) / 80d)
$q2b_gain = 600000d - $q2b_cost
$q2b_rem = (1000000d * 0.30d) + ((80000d * 30d) / 80d)
Assert-Equal 50000d $q2a_surp "Q2A Surp"
Assert-Equal 50000d $q2b_gain "Q2B Gain"
Assert-Equal 330000d $q2b_rem "Q2B Rem"

# Q3
$q3_gw = 400000d - (1000000d * 0.30d)
$q3_amort = $q3_gw / 10d
$q3_unr = 40000d * 0.30d
$q3_inc = (200000d * 0.30d) - $q3_amort - $q3_unr
$q3_end = 400000d + $q3_inc - (50000d * 0.30d)
$q3_end_chk = (1150000d * 0.30d) + ($q3_gw - $q3_amort) - $q3_unr
Assert-Equal 38000d $q3_inc "Q3 EM Inc"
Assert-Equal 423000d $q3_end "Q3 EM End"
Assert-Equal $q3_end $q3_end_chk "Q3 EM CrossCheck"

foreach ($tok in @("60,000", "140,000", "230,000", "30,000", "50,000", "330,000", "38,000", "423,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-13 CrossCheck $tok"
}

Write-Host "[Test-L1C-13] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0