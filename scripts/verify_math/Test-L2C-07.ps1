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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "02_level2_commercial\L2C-07_provisions_and_liabilities.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_bonus_prov = (600000d * 4d) / 6d
$ex_bonus_rem = 620000d - $ex_bonus_prov
$ex_rep_rem = 1250000d - 900000d
$ex_ret_inc = 350000d - 200000d
Assert-Equal 400000d $ex_bonus_prov "Ex Bonus Prov"
Assert-Equal 220000d $ex_bonus_rem "Ex Bonus Rem"
Assert-Equal 350000d $ex_rep_rem "Ex Rep Rem"
Assert-Equal 150000d $ex_ret_inc "Ex Ret Inc"

# Q1
$q1_bonus_prov = (900000d * 4d) / 6d
$q1_bonus_rem = 880000d - $q1_bonus_prov
$q1_rep = 2000000d / 5d
$q1_ret = 500000d - 300000d
Assert-Equal 600000d $q1_bonus_prov "Q1 Bonus Prov"
Assert-Equal 280000d $q1_bonus_rem "Q1 Bonus Rem"
Assert-Equal 400000d $q1_rep "Q1 Rep"
Assert-Equal 200000d $q1_ret "Q1 Ret Inc"

# Q2
$q2_war_rem = 75000d - 60000d
$q2_war_prov = 8000000d * 0.015d
$q2_ret_end = 1500000d - 400000d + 450000d
Assert-Equal 15000d $q2_war_rem "Q2 War Rem"
Assert-Equal 120000d $q2_war_prov "Q2 War Prov"
Assert-Equal 1550000d $q2_ret_end "Q2 Ret End"

foreach ($tok in @("400,000", "220,000", "150,000", "600,000", "280,000", "120,000", "1,550,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2C-07 CrossCheck $tok"
}

Write-Host "[Test-L2C-07] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
