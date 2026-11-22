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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "01_level3\L3-06_tangible_fixed_assets.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_cost = 960000d + 40000d
$ex_sl = $ex_cost / 5d
$ex_db1 = $ex_cost * 0.40d
$ex_db2 = ($ex_cost - $ex_db1) * 0.40d
$ex_db_bv2 = $ex_cost - $ex_db1 - $ex_db2
$ex_retire_loss = $ex_db_bv2 - 60000d
$ex_disp_loss = $ex_db_bv2 + 40000d
Assert-Equal 200000d $ex_sl "Ex SL"
Assert-Equal 400000d $ex_db1 "Ex DB1"
Assert-Equal 240000d $ex_db2 "Ex DB2"
Assert-Equal 360000d $ex_db_bv2 "Ex DB BV2"
Assert-Equal 300000d $ex_retire_loss "Ex Retire Loss"
Assert-Equal 400000d $ex_disp_loss "Ex Disposal Loss"

# Q1
$q1_cost = 1140000d + 60000d
$q1_sl1 = ($q1_cost / 5d) * (6d / 12d)
$q1_sl2 = $q1_cost / 5d
$q1_db1 = $q1_cost * 0.40d * (6d / 12d)
$q1_db2 = ($q1_cost - $q1_db1) * 0.40d
$q1_db_bv2 = $q1_cost - $q1_db1 - $q1_db2
Assert-Equal 1200000d $q1_cost "Q1 Cost"
Assert-Equal 120000d $q1_sl1 "Q1 SL1"
Assert-Equal 240000d $q1_sl2 "Q1 SL2"
Assert-Equal 240000d $q1_db1 "Q1 DB1"
Assert-Equal 384000d $q1_db2 "Q1 DB2"
Assert-Equal 576000d $q1_db_bv2 "Q1 DB BV2"

# Q2
$q2_m_dep = (800000d - 200000d) * 0.25d * (8d / 12d)
$q2_m_retire = (600000d - $q2_m_dep) - 50000d
$q2_e_dep = 100000d * (6d / 12d)
$q2_e_disp = (500000d - 380000d - $q2_e_dep) + 20000d
Assert-Equal 100000d $q2_m_dep "Q2 Machine Dep"
Assert-Equal 450000d $q2_m_retire "Q2 Retire Loss"
Assert-Equal 50000d $q2_e_dep "Q2 Equip Dep"
Assert-Equal 90000d $q2_e_disp "Q2 Disposal Loss"

# Q3
$q3_cost = 360000d / 0.36d
$q3_bv2 = $q3_cost - 360000d
$q3_dep3 = $q3_bv2 * 0.20d * (6d / 12d)
$q3_bv3 = $q3_bv2 - $q3_dep3
$q3_sale_loss = $q3_bv3 - 500000d
$q3_profit_distort = 100000d - (100000d * 0.20d)
Assert-Equal 1000000d $q3_cost "Q3 Cost"
Assert-Equal 64000d $q3_dep3 "Q3 Dep3"
Assert-Equal 576000d $q3_bv3 "Q3 BV3"
Assert-Equal 76000d $q3_sale_loss "Q3 Sale Loss"
Assert-Equal 80000d $q3_profit_distort "Q3 Profit Distortion"

foreach ($tok in @("360,000", "300,000", "1,200,000", "384,000", "576,000", "450,000", "90,000", "64,000", "76,000", "80,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L3-06 CrossCheck $tok"
}

Write-Host "[Test-L3-06] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
