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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "03_level2_industrial\L2I-02_cost_elements.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_mat_std = 405d * 500d
$ex_mat_act = (100d * 500d) + (305d * 520d)
$ex_mat_var = $ex_mat_std - $ex_mat_act
$ex_mat_end = 95d * 520d
$ex_lab_act = 420000d + 100000d - 80000d
$ex_lab_std = (180d + 30d) * 2000d
$ex_lab_var = $ex_lab_std - $ex_lab_act
Assert-Equal (-6100d) $ex_mat_var "Ex Mat Var"
Assert-Equal 49400d $ex_mat_end "Ex Mat End"
Assert-Equal (-20000d) $ex_lab_var "Ex Lab Var"

# Q1
$q1_purch = 252000d + 12000d
$q1_avg_u = (80000d + $q1_purch) / (200d + 600d)
$q1_std_out = 590d * 420d
$q1_act_out = 590d * $q1_avg_u
$q1_var = $q1_std_out - $q1_act_out
$q1_end = 210d * $q1_avg_u
Assert-Equal 430d $q1_avg_u "Q1 Avg Unit"
Assert-Equal 247800d $q1_std_out "Q1 Std Out"
Assert-Equal (-5900d) $q1_var "Q1 Price Var"
Assert-Equal 90300d $q1_end "Q1 End Mat"

# Q2
$q2_lab_act = 650000d + 150000d - 120000d
$q2_lab_std = (280d + 30d + 10d) * 2200d
$q2_lab_var = $q2_lab_std - $q2_lab_act
$q2_exp_dir = 90000d + (500d * 100d)
$q2_exp_ind = (240000d / 12d) + 48000d
Assert-Equal 680000d $q2_lab_act "Q2 Lab Act"
Assert-Equal 704000d $q2_lab_std "Q2 Lab Std"
Assert-Equal 24000d $q2_lab_var "Q2 Rate Var"
Assert-Equal 140000d $q2_exp_dir "Q2 Dir Exp"
Assert-Equal 68000d $q2_exp_ind "Q2 Ind Exp"

# Q3
$q3_rcp_cogs = (700d * 500d) + 50000d
$q3_rcp_end = 300d * 500d
$q3_cns_cogs = (700d * 500d) + 35000d
$q3_cns_end = 300d * 550d
Assert-Equal 400000d $q3_rcp_cogs "Q3 Receipt COGS"
Assert-Equal 150000d $q3_rcp_end "Q3 Receipt End"
Assert-Equal 385000d $q3_cns_cogs "Q3 Consume COGS"
Assert-Equal 165000d $q3_cns_end "Q3 Consume End"
Assert-Equal 15000d ($q3_rcp_cogs - $q3_cns_cogs) "Q3 Profit Diff"

foreach ($tok in @("202,500", "208,600", "49,400", "247,800", "5,900", "90,300", "704,000", "24,000", "140,000", "68,000", "400,000", "385,000", "15,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2I-02 CrossCheck $tok"
}

Write-Host "[Test-L2I-02] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0