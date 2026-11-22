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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "05_level1_industrial\L1I-10_capital_budgeting_and_uncertainty.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_cf = (465500d * 0.60d) + (300000d * 0.40d)
$ex_pv = ($ex_cf / 1.10d) + ($ex_cf / 1.21d) + ($ex_cf / 1.331d)
$ex_npv = $ex_pv - 900000d
Assert-Equal 399300d $ex_cf "Ex CF"
Assert-Equal 993000d $ex_pv "Ex PV"
Assert-Equal 93000d $ex_npv "Ex NPV"

# Q1
$q1_wacc = (0.05d * 0.60d * 0.40d) + (0.13d * 0.60d)
$q1_pb = [Math]::Round((820000d / 441000d), 2, [MidpointRounding]::AwayFromZero)
Assert-Equal 0.09d $q1_wacc "Q1 WACC"
Assert-Equal 1.86d $q1_pb "Q1 Payback"

# Q2
$q2_t0 = (-1000000d) + 250000d + ((400000d - 250000d) * 0.40d)
$q2_cf = (535000d * 0.60d) + ((500000d - 200000d) * 0.40d)
$q2_pv = ($q2_cf / 1.05d) + ($q2_cf / 1.1025d)
$q2_npv = $q2_pv + $q2_t0
Assert-Equal (-690000d) $q2_t0 "Q2 T0"
Assert-Equal 441000d $q2_cf "Q2 CF"
Assert-Equal 820000d $q2_pv "Q2 PV"
Assert-Equal 130000d $q2_npv "Q2 NPV"

# Q3
$q3_a = (1000000d * 0.60d) + ((-200000d) * 0.40d)
$q3_b = (500000d * 0.60d) + (300000d * 0.40d)
$q3_full = (1000000d * 0.60d) + (300000d * 0.40d)
$q3_evpi = $q3_full - $q3_a
Assert-Equal 520000d $q3_a "Q3 A"
Assert-Equal 420000d $q3_b "Q3 B"
Assert-Equal 720000d $q3_full "Q3 Full"
Assert-Equal 200000d $q3_evpi "Q3 EVPI"

foreach ($tok in @("399,300", "993,000", "93,000", "9.0%", "1.86", "690,000", "441,000", "820,000", "130,000", "520,000", "720,000", "200,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1I-10 CrossCheck $tok"
}

Write-Host "[Test-L1I-10] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0