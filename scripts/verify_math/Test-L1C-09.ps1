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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-09_retirement_benefits.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_int = 1000000d * 0.03d
$ex_exp_ret = 400000d * 0.05d
$ex_amort = 50000d / 5d
$ex_cost = 150000d + $ex_int - $ex_exp_ret + $ex_amort
$ex_prov1 = 550000d + $ex_cost - 120000d
$ex_prov1_bs = 1130000d - 465000d - 65000d
Assert-Equal 170000d $ex_cost "Ex Cost"
Assert-Equal 600000d $ex_prov1 "Ex Prov1"
Assert-Equal $ex_prov1 $ex_prov1_bs "Ex Prov1 CrossCheck"

# Q1
$q1_int = 2000000d * 0.02d
$q1_exp_ret = 800000d * 0.04d
$q1_amort = 100000d / 5d
$q1_cost = 240000d + $q1_int - $q1_exp_ret + $q1_amort
$q1_pbo1 = 2000000d + 240000d + $q1_int - 100000d + 100000d
$q1_pa1 = 800000d + $q1_exp_ret + 200000d - 100000d
$q1_prov1 = $q1_pbo1 - $q1_pa1 - 80000d
Assert-Equal 268000d $q1_cost "Q1 Cost"
Assert-Equal 2280000d $q1_pbo1 "Q1 PBO1"
Assert-Equal 932000d $q1_pa1 "Q1 PA1"
Assert-Equal 1268000d $q1_prov1 "Q1 Prov1"

# Q2
$q2_liab = 1130000d - 465000d
$q2_adj_cum = (-65000d) * 0.70d
$q2_dta = 65000d * 0.30d
$q2_oci = ((-25000d) * 0.70d) + (10000d * 0.70d)
Assert-Equal 665000d $q2_liab "Q2 Liab"
Assert-Equal (-45500d) $q2_adj_cum "Q2 Adj Cum"
Assert-Equal 19500d $q2_dta "Q2 DTA"
Assert-Equal (-10500d) $q2_oci "Q2 OCI"

# Q3
$q3_prov_ext = 600000d * 0.20d
$q3_ap = (1130000d * 0.20d) - (465000d * 0.20d)
$q3_loss = $q3_ap - $q3_prov_ext
Assert-Equal 120000d $q3_prov_ext "Q3 Prov Ext"
Assert-Equal 133000d $q3_ap "Q3 AP"
Assert-Equal 13000d $q3_loss "Q3 Loss"

foreach ($tok in @("170,000", "600,000", "268,000", "2,280,000", "932,000", "1,268,000", "665,000", "45,500", "19,500", "10,500", "133,000", "13,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-09 CrossCheck $tok"
}

Write-Host "[Test-L1C-09] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0