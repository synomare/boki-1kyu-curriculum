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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "03_level2_industrial\L2I-01_cost_accounting_overview.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_mat_used = 40000d + 200000d - 60000d
$ex_oh = 30000d + 60000d + 90000d
$ex_tot_mfg = 150000d + 160000d + 20000d + $ex_oh
$ex_cogm = 50000d + $ex_tot_mfg - 70000d
$ex_cogs = 80000d + $ex_cogm - 60000d
$ex_op_inc = 800000d - $ex_cogs - 150000d
Assert-Equal 180000d $ex_mat_used "Ex Mat Used"
Assert-Equal 180000d $ex_oh "Ex Overhead"
Assert-Equal 510000d $ex_tot_mfg "Ex Total Mfg"
Assert-Equal 490000d $ex_cogm "Ex COGM"
Assert-Equal 510000d $ex_cogs "Ex COGS"
Assert-Equal 140000d $ex_op_inc "Ex Op Income"

# Q1
$q1_mat_used = 50000d + 310000d - 40000d
$q1_oh = 50000d + 70000d + 90000d
$q1_tot_mfg = 270000d + 230000d + 30000d + $q1_oh
$q1_cogm = 60000d + $q1_tot_mfg - 80000d
$q1_cogs = 100000d + $q1_cogm - 120000d
Assert-Equal 320000d $q1_mat_used "Q1 Mat Used"
Assert-Equal 210000d $q1_oh "Q1 OH"
Assert-Equal 740000d $q1_tot_mfg "Q1 Total Mfg"
Assert-Equal 720000d $q1_cogm "Q1 COGM"
Assert-Equal 700000d $q1_cogs "Q1 COGS"

# Q2
$q2_dir = 400000d + 280000d
$q2_oh = 70000d + 120000d + 60000d
$q2_mfg = $q2_dir + $q2_oh
$q2_sga = 80000d + 210000d
$q2_non = 25000d + 150000d + 95000d
Assert-Equal 680000d $q2_dir "Q2 Direct"
Assert-Equal 250000d $q2_oh "Q2 OH"
Assert-Equal 930000d $q2_mfg "Q2 Mfg"
Assert-Equal 290000d $q2_sga "Q2 SGA"
Assert-Equal 270000d $q2_non "Q2 NonCost"
Assert-Equal 1490000d ($q2_mfg + $q2_sga + $q2_non) "Q2 Total Check"

# Q3
$q3_gp = 1200000d * 0.35d
$q3_cogs = 1200000d - $q3_gp
$q3_op = $q3_gp - 200000d
$q3_cogm = $q3_cogs + 110000d - 90000d
$q3_tot_mfg = $q3_cogm + 50000d - 70000d
$q3_mat_used = $q3_tot_mfg - 260000d - 190000d
$q3_mat_purch = $q3_mat_used + 60000d - 40000d
$q3_err_impact = 100000d * 0.25d
Assert-Equal 220000d $q3_op "Q3 Op Income"
Assert-Equal 350000d $q3_mat_purch "Q3 Mat Purchase"
Assert-Equal 25000d $q3_err_impact "Q3 Error Impact"

foreach ($tok in @("490,000", "510,000", "740,000", "720,000", "700,000", "930,000", "290,000", "270,000", "350,000", "220,000", "25,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2I-01 CrossCheck $tok"
}

Write-Host "[Test-L2I-01] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0