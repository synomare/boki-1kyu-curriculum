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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-05_inventory_retail_and_revenue_advanced.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_end_ret = 200000d + 950000d + 50000d - 200000d - 700000d
$ex_lcm_r = 720000d / 1200000d
$ex_lcm_end = $ex_end_ret * $ex_lcm_r
$ex_cost_r = 720000d / 1000000d
$ex_cost_end = $ex_end_ret * $ex_cost_r
Assert-Equal 300000d $ex_end_ret "Ex End Retail"
Assert-Equal 0.60d $ex_lcm_r "Ex LCM Ratio"
Assert-Equal 180000d $ex_lcm_end "Ex LCM End"
Assert-Equal 0.72d $ex_cost_r "Ex Cost Ratio"
Assert-Equal 216000d $ex_cost_end "Ex Cost End"

# Q1
$q1_a_rev = (100000d * 100000d) / 125000d
$q1_a_pt = (100000d * 25000d) / 125000d
$q1_b_rev = 90d * 1000d
$q1_b_ref = 10d * 1000d
$q1_b_cogs = 90d * 600d
$q1_b_ret = 10d * 600d
Assert-Equal 80000d $q1_a_rev "Q1A Rev"
Assert-Equal 20000d $q1_a_pt "Q1A Pt"
Assert-Equal 90000d $q1_b_rev "Q1B Rev"
Assert-Equal 10000d $q1_b_ref "Q1B Ref"
Assert-Equal 54000d $q1_b_cogs "Q1B COGS"
Assert-Equal 6000d $q1_b_ret "Q1B Ret"

# Q2
$q2_prog = 1100000d / 2200000d
$q2_rev = 2000000d * $q2_prog
$q2_tot_loss = 2200000d - 2000000d
$q2_rec_loss = 1100000d - $q2_rev
$q2_prov = $q2_tot_loss - $q2_rec_loss
Assert-Equal 1000000d $q2_rev "Q2 Rev"
Assert-Equal 100000d $q2_prov "Q2 Prov"

# Q3
$q3_a_rev = 500000d * 0.10d
$q3_b_int1 = 1000000d * 0.05d
$q3_b_int2 = 1050000d * 0.05d
Assert-Equal 50000d $q3_a_rev "Q3A Rev"
Assert-Equal 50000d $q3_b_int1 "Q3B Int1"
Assert-Equal 52500d $q3_b_int2 "Q3B Int2"
Assert-Equal 1102500d (1000000d + $q3_b_int1 + $q3_b_int2) "Q3B Total"

foreach ($tok in @("180,000", "216,000", "80,000", "20,000", "54,000", "1,000,000", "1,100,000", "100,000", "52,500", "1,102,500")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-05 CrossCheck $tok"
}

Write-Host "[Test-L1C-05] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0