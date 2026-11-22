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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "05_level1_industrial\L1I-01_cost_standards_and_advanced_departmental.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_cut = (500000d * 0.60d) + (6000d * 50d)
$ex_asm = (500000d * 0.40d) + (3000d * 50d)
$ex_var = ($ex_cut + $ex_asm) - 980000d
Assert-Equal 600000d $ex_cut "Ex Cut"
Assert-Equal 350000d $ex_asm "Ex Asm"
Assert-Equal (-30000d) $ex_var "Ex Var"

# Q1
$q1_x = 190000d / 0.95d
$q1_y = 160000d + (0.20d * $q1_x)
$q1_d1 = 500000d + ($q1_x * 0.40d) + ($q1_y * 0.50d)
$q1_d2 = 400000d + ($q1_x * 0.40d) + ($q1_y * 0.25d)
Assert-Equal 200000d $q1_x "Q1 X"
Assert-Equal 200000d $q1_y "Q1 Y"
Assert-Equal 680000d $q1_d1 "Q1 D1"
Assert-Equal 530000d $q1_d2 "Q1 D2"

# Q2
$q2_s_a = (840000d * 5d) / 6d
$q2_s_b = (840000d * 1d) / 6d
$q2_m_a = (600000d * 0.50d) + (5000d * 40d)
$q2_m_b = (600000d * 0.50d) + (1000d * 40d)
Assert-Equal 700000d $q2_s_a "Q2 S A"
Assert-Equal 140000d $q2_s_b "Q2 S B"
Assert-Equal 500000d $q2_m_a "Q2 M A"
Assert-Equal 340000d $q2_m_b "Q2 M B"

# Q3
$q3_non = 100000d + 80000d + 120000d
Assert-Equal 300000d $q3_non "Q3 NonCost"

foreach ($tok in @("600,000", "350,000", "950,000", "680,000", "530,000", "700,000", "140,000", "500,000", "340,000", "1,200,000", "300,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1I-01 CrossCheck $tok"
}

Write-Host "[Test-L1I-01] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0