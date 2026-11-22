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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-08_new_lease_accounting_mastery.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_pv0 = (399300d / 1.10d) + (399300d / 1.21d) + (399300d / 1.331d)
$ex_i1 = $ex_pv0 * 0.10d
$ex_l1 = $ex_pv0 + $ex_i1 - 399300d
$ex_new_l = (330750d / 1.05d) + (330750d / 1.1025d)
$ex_adj = $ex_new_l - $ex_l1
$ex_new_rou = (993000d - 331000d) + $ex_adj
$ex_new_dep = $ex_new_rou / 2d
$ex_i2 = $ex_new_l * 0.05d
$ex_l2 = $ex_new_l + $ex_i2 - 330750d
$ex_i3 = $ex_l2 * 0.05d
Assert-Equal 993000d $ex_pv0 "Ex PV0"
Assert-Equal 693000d $ex_l1 "Ex L1"
Assert-Equal 615000d $ex_new_l "Ex New L"
Assert-Equal (-78000d) $ex_adj "Ex Adj"
Assert-Equal 584000d $ex_new_rou "Ex New ROU"
Assert-Equal 292000d $ex_new_dep "Ex New Dep"
Assert-Equal 30750d $ex_i2 "Ex I2"
Assert-Equal 15750d $ex_i3 "Ex I3"

# Q1
$q1_rou = 993000d + 30000d + 47000d - 20000d
$q1_dep = $q1_rou / 3d
Assert-Equal 1050000d $q1_rou "Q1 ROU"
Assert-Equal 350000d $q1_dep "Q1 Dep"

# Q2
$q2_rou = (600000d * 400000d) / 1000000d
$q2_gain = ((1000000d - 600000d) * 600000d) / 1000000d
Assert-Equal 240000d $q2_rou "Q2 ROU"
Assert-Equal 240000d $q2_gain "Q2 Gain"

# Q3
$q3_i1 = 820000d * 0.05d
$q3_p1 = 441000d - $q3_i1
$q3_m1_tot = (820000d - 738000d) + $q3_i1
$q3_m2_cogs = (738000d * $q3_p1) / 820000d
$q3_m2_tot = (441000d - $q3_m2_cogs)
Assert-Equal 41000d $q3_i1 "Q3 I1"
Assert-Equal 400000d $q3_p1 "Q3 P1"
Assert-Equal 123000d $q3_m1_tot "Q3 M1 Tot"
Assert-Equal 360000d $q3_m2_cogs "Q3 M2 COGS"
Assert-Equal 81000d $q3_m2_tot "Q3 M2 Tot"

foreach ($tok in @("993,000", "615,000", "584,000", "292,000", "1,050,000", "350,000", "240,000", "123,000", "360,000", "81,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-08 CrossCheck $tok"
}

Write-Host "[Test-L1C-08] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0