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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "03_level2_industrial\L2I-08_direct_costing_cvp_and_factory.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_dir = (2500d * 500d) - 1000000d
$ex_abs = $ex_dir + (500d * 200d)
$ex_bep = 1000000d / 0.50d
Assert-Equal 250000d $ex_dir "Ex Dir"
Assert-Equal 350000d $ex_abs "Ex Abs"
Assert-Equal 2000000d $ex_bep "Ex BEP"

# Q1
$q1_p1_dir = (1600d * 1000d) - 1200000d
$q1_p1_abs = $q1_p1_dir + (400d * 400d)
$q1_p2_dir = (1800d * 1000d) - 1200000d
$q1_p2_abs = $q1_p2_dir + (200d * 500d) - (400d * 400d)
Assert-Equal 400000d $q1_p1_dir "Q1 P1 Dir"
Assert-Equal 560000d $q1_p1_abs "Q1 P1 Abs"
Assert-Equal 600000d $q1_p2_dir "Q1 P2 Dir"
Assert-Equal 540000d $q1_p2_abs "Q1 P2 Abs"

# Q2
$q2_bep_q = 3600000d / 2000d
$q2_bep_s = 3600000d / 0.40d
$q2_op = (2500d * 2000d) - 3600000d
$q2_ms = (12500000d - $q2_bep_s) / 12500000d
$q2_tgt_s = (3600000d + 2400000d) / 0.40d
$q2_pct_s = 3600000d / (0.40d - 0.20d)
Assert-Equal 1800d $q2_bep_q "Q2 BEP Q"
Assert-Equal 9000000d $q2_bep_s "Q2 BEP S"
Assert-Equal 1400000d $q2_op "Q2 Op Inc"
Assert-Equal 0.28d $q2_ms "Q2 Safety Margin"
Assert-Equal 15000000d $q2_tgt_s "Q2 Target S"
Assert-Equal 18000000d $q2_pct_s "Q2 Pct S"

# Q3
$q3_ho = 1165000d - 165000d
$q3_fa = 720000d + 200000d + 80000d
$q3_up = (165000d * 10d) / 110d
Assert-Equal 1000000d $q3_ho "Q3 HO"
Assert-Equal 1000000d $q3_fa "Q3 FA"
Assert-Equal 15000d $q3_up "Q3 Unrealized Profit"

foreach ($tok in @("350,000", "250,000", "560,000", "540,000", "9,000,000", "1,400,000", "15,000,000", "18,000,000", "1,000,000", "15,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2I-08 CrossCheck $tok"
}

Write-Host "[Test-L2I-08] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0