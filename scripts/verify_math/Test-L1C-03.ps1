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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-03_financial_instruments_securities_bonds.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_b0 = [Math]::Round((30000d/1.05d) + (30000d/1.1025d) + (1030000d/1.157625d), 0, [MidpointRounding]::AwayFromZero)
$ex_i1 = [Math]::Round($ex_b0 * 0.05d, 0, [MidpointRounding]::AwayFromZero)
$ex_b1 = $ex_b0 + $ex_i1 - 30000d
$ex_i2 = [Math]::Round($ex_b1 * 0.05d, 0, [MidpointRounding]::AwayFromZero)
$ex_b2 = $ex_b1 + $ex_i2 - 30000d
$ex_a3 = 1000000d - $ex_b2
$ex_i3 = 30000d + $ex_a3
Assert-Equal 945535d $ex_b0 "Ex B0"
Assert-Equal 47277d $ex_i1 "Ex I1"
Assert-Equal 962812d $ex_b1 "Ex B1"
Assert-Equal 48141d $ex_i2 "Ex I2"
Assert-Equal 980953d $ex_b2 "Ex B2"
Assert-Equal 49047d $ex_i3 "Ex I3"

# Q1
$q1_b0 = 918303d
$q1_i1 = [Math]::Round($q1_b0 * 0.05d, 0, [MidpointRounding]::AwayFromZero)
$q1_b1 = $q1_b0 + $q1_i1 - 20000d
$q1_i2 = [Math]::Round($q1_b1 * 0.05d, 0, [MidpointRounding]::AwayFromZero)
$q1_b2 = $q1_b1 + $q1_i2 - 20000d
$q1_gain = $q1_b2 - 960000d
Assert-Equal 45915d $q1_i1 "Q1 I1"
Assert-Equal 944218d $q1_b1 "Q1 B1"
Assert-Equal 47211d $q1_i2 "Q1 I2"
Assert-Equal 971429d $q1_b2 "Q1 B2"
Assert-Equal 11429d $q1_gain "Q1 Gain"

# Q2
$q2_a = 500000d - 220000d
$q2_b = 1000000d - 400000d
$q2_c = 340000d - 300000d
Assert-Equal 280000d $q2_a "Q2A"
Assert-Equal 600000d $q2_b "Q2B"
Assert-Equal 40000d $q2_c "Q2C"

# Q3
$q3_amort = (1000000d - 980000d) / 5d
$q3_cap_sep = 980000d + $q3_amort + 70000d
Assert-Equal 4000d $q3_amort "Q3 Amort"
Assert-Equal 1054000d $q3_cap_sep "Q3 Cap Sep"

foreach ($tok in @("945,535", "962,812", "980,953", "944,218", "971,429", "11,429", "280,000", "600,000", "1,054,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-03 CrossCheck $tok"
}

Write-Host "[Test-L1C-03] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0