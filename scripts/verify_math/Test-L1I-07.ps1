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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "05_level1_industrial\L1I-07_divisional_performance_and_transfer_pricing.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_ri_cur = 2000000d - (10000000d * 0.10d)
$ex_ri_new = 2750000d - (15000000d * 0.10d)
Assert-Equal 1000000d $ex_ri_cur "Ex RI Cur"
Assert-Equal 1250000d $ex_ri_new "Ex RI New"

# Q1
$q1_ros = 2000000d / 20000000d
$q1_ato = 20000000d / 10000000d
$q1_nopat = 2000000d * 0.70d
$q1_eva = $q1_nopat - (10000000d * 0.08d)
Assert-Equal 0.10d $q1_ros "Q1 ROS"
Assert-Equal 2.0d $q1_ato "Q1 ATO"
Assert-Equal 1400000d $q1_nopat "Q1 NOPAT"
Assert-Equal 600000d $q1_eva "Q1 EVA"

# Q2
$q2_a = 600d + 0d
$q2_b = 600d + (1000d - 600d)
Assert-Equal 600d $q2_a "Q2A"
Assert-Equal 1000d $q2_b "Q2B"

# Q3
$q3_loss = (750d - 600d) * 1000d
Assert-Equal 150000d $q3_loss "Q3 Loss"

foreach ($tok in @("18.33%", "1,250,000", "20%", "1,400,000", "600,000", "1,300", "150,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1I-07 CrossCheck $tok"
}

Write-Host "[Test-L1I-07] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0