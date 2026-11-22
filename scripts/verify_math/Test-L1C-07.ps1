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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-07_asset_retirement_obligations.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_aro0 = 1197900d / 1.331d
$ex_i1 = $ex_aro0 * 0.10d
$ex_aro1 = $ex_aro0 + $ex_i1
$ex_i2 = $ex_aro1 * 0.10d
$ex_aro2 = $ex_aro1 + $ex_i2
$ex_i3 = $ex_aro2 * 0.10d
$ex_aro3 = $ex_aro2 + $ex_i3
$ex_settle = 1220000d - $ex_aro3
Assert-Equal 900000d $ex_aro0 "Ex ARO0"
Assert-Equal 90000d $ex_i1 "Ex I1"
Assert-Equal 99000d $ex_i2 "Ex I2"
Assert-Equal 108900d $ex_i3 "Ex I3"
Assert-Equal 22100d $ex_settle "Ex Settle"

# Q1
$q1_aro0 = 441000d / 1.1025d
$q1_i1 = $q1_aro0 * 0.05d
$q1_i2 = ($q1_aro0 + $q1_i1) * 0.05d
$q1_settle = 441000d - 430000d
Assert-Equal 400000d $q1_aro0 "Q1 ARO0"
Assert-Equal 20000d $q1_i1 "Q1 I1"
Assert-Equal 21000d $q1_i2 "Q1 I2"
Assert-Equal 11000d $q1_settle "Q1 Settle"

# Q2
$q2a_pv = 220500d / 1.1025d
$q2a_dep = (600000d + $q2a_pv) / 2d
$q2a_int = (990000d * 0.10d) + ($q2a_pv * 0.05d)
$q2b_pv = (-242000d) / 1.21d
$q2b_dep = (600000d + $q2b_pv) / 2d
$q2b_int = (990000d + $q2b_pv) * 0.10d
Assert-Equal 200000d $q2a_pv "Q2A PV"
Assert-Equal 400000d $q2a_dep "Q2A Dep"
Assert-Equal 109000d $q2a_int "Q2A Int"
Assert-Equal (-200000d) $q2b_pv "Q2B PV"
Assert-Equal 200000d $q2b_dep "Q2B Dep"
Assert-Equal 79000d $q2b_int "Q2B Int"

# Q3
$q3_dep = 300000d / 5d
$q3_gain = 520000d - (1000000d - 600000d)
Assert-Equal 60000d $q3_dep "Q3 Dep"
Assert-Equal 120000d $q3_gain "Q3 Gain"

foreach ($tok in @("1,197,900", "22,100", "400,000", "11,000", "109,000", "79,000", "60,000", "120,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-07 CrossCheck $tok"
}

Write-Host "[Test-L1C-07] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0