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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-02_financial_instruments_receivables.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_pv = (60500d / 1.1d) + (1270500d / 1.21d)
$ex_allow = 1210000d - $ex_pv
$ex_i2 = $ex_pv * 0.10d
$ex_rev2 = $ex_i2 - 60500d
$ex_b2 = $ex_pv + $ex_rev2
$ex_i3 = $ex_b2 * 0.10d
$ex_rev3 = $ex_i3 - 60500d
Assert-Equal 1105000d $ex_pv "Ex PV"
Assert-Equal 105000d $ex_allow "Ex Allow"
Assert-Equal 110500d $ex_i2 "Ex I2"
Assert-Equal 50000d $ex_rev2 "Ex Rev2"
Assert-Equal 1155000d $ex_b2 "Ex B2"
Assert-Equal 115500d $ex_i3 "Ex I3"
Assert-Equal 55000d $ex_rev3 "Ex Rev3"

# Q1
$q1_gen = 5000000d * 0.02d
$q1_doubt = (2000000d - 800000d) * 0.50d
$q1_bank = 600000d - 150000d
$q1_tot = $q1_gen + $q1_doubt + $q1_bank
$q1_add = $q1_tot - 350000d
Assert-Equal 1150000d $q1_tot "Q1 Total"
Assert-Equal 800000d $q1_add "Q1 Add"

# Q2
$q2_pv = [Math]::Round((20000d / 1.05d) + (1020000d / 1.1025d), 0, [MidpointRounding]::AwayFromZero)
$q2_allow = 1000000d - $q2_pv
$q2_i2 = [Math]::Round($q2_pv * 0.05d, 0, [MidpointRounding]::AwayFromZero)
$q2_rev2 = $q2_i2 - 20000d
$q2_b2 = $q2_pv + $q2_rev2
$q2_rev3 = 1000000d - $q2_b2
$q2_i3 = 20000d + $q2_rev3
Assert-Equal 944218d $q2_pv "Q2 PV"
Assert-Equal 55782d $q2_allow "Q2 Allow"
Assert-Equal 47211d $q2_i2 "Q2 I2"
Assert-Equal 27211d $q2_rev2 "Q2 Rev2"
Assert-Equal 971429d $q2_b2 "Q2 B2"
Assert-Equal 28571d $q2_rev3 "Q2 Rev3"
Assert-Equal 48571d $q2_i3 "Q2 I3"

# Q3
$q3_loss = 1000000d - (960000d + 10000d - 20000d)
Assert-Equal 50000d $q3_loss "Q3 Loss"

foreach ($tok in @("1,105,000", "1,150,000", "800,000", "944,218", "55,782", "47,211", "28,571", "48,571", "50,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-02 CrossCheck $tok"
}

Write-Host "[Test-L1C-02] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0