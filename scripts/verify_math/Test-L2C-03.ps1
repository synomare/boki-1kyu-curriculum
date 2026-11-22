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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "02_level2_commercial\L2C-03_inventory_valuation.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_shrink = (300d - 280d) * 1000d
$ex_val = (1000d - 900d) * 280d
$ex_bs = 280d * 900d
$ex_cogs = (200000d + 1000000d - 300000d) + $ex_shrink + $ex_val
$ex_gp = 1500000d - $ex_cogs
Assert-Equal 20000d $ex_shrink "Ex Shrink"
Assert-Equal 28000d $ex_val "Ex Val Loss"
Assert-Equal 252000d $ex_bs "Ex BS Inv"
Assert-Equal 948000d $ex_cogs "Ex COGS"
Assert-Equal 552000d $ex_gp "Ex GP"

# Q1
$q1_shrink = (200d - 190d) * 1200d
$q1_val = (1200d - 1100d) * 190d
$q1_bs = 190d * 1100d
$q1_cogs = (150000d + 850000d - 240000d) + $q1_shrink + $q1_val
$q1_gp = 1200000d - $q1_cogs
Assert-Equal 12000d $q1_shrink "Q1 Shrink"
Assert-Equal 19000d $q1_val "Q1 Val Loss"
Assert-Equal 209000d $q1_bs "Q1 BS Inv"
Assert-Equal 791000d $q1_cogs "Q1 COGS"
Assert-Equal 409000d $q1_gp "Q1 GP"

# Q2
$q2_a_shrink = (100d - 95d) * 2000d
$q2_a_val = (2000d - 1800d) * 95d
$q2_a_bs = 95d * 1800d
$q2_b_shrink = (100d - 98d) * 1500d
$q2_b_val = 0d
$q2_b_bs = 98d * 1500d
Assert-Equal 318000d ($q2_a_bs + $q2_b_bs) "Q2 BS Total"
Assert-Equal 22000d ($q2_a_val + $q2_b_shrink) "Q2 COGS In"
Assert-Equal 10000d $q2_a_shrink "Q2 SGA"

# Q3
$q3_nrv = 1100d - 180d
$q3_x = 441600d / $q3_nrv
$q3_shrink = (500d - $q3_x) * 1000d
$q3_val = (1000d - $q3_nrv) * $q3_x
Assert-Equal 920d $q3_nrv "Q3 NRV"
Assert-Equal 480d $q3_x "Q3 X"
Assert-Equal 20000d $q3_shrink "Q3 Shrink"
Assert-Equal 38400d $q3_val "Q3 Val Loss"
Assert-Equal 500000d (441600d + $q3_shrink + $q3_val) "Q3 Check"

foreach ($tok in @("252,000", "948,000", "552,000", "209,000", "791,000", "409,000", "318,000", "22,000", "441,600", "38,400")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2C-03 CrossCheck $tok"
}

Write-Host "[Test-L2C-03] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
