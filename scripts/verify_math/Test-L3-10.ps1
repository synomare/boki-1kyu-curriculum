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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "01_level3\L3-10_closing_and_financial_statements.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_pre_d = 1000000d + 300000d + 150000d + 500000d + 700000d + 250000d + 60000d + 40000d
$ex_pre_c = 200000d + 3000d + 100000d + 1300000d + 197000d + 1200000d
Assert-Equal 3000000d $ex_pre_d "Ex Pre-TB Debit"
Assert-Equal $ex_pre_d $ex_pre_c "Ex Pre-TB Match"

$ex_cogs = 150000d + 700000d - 180000d
$ex_exp = $ex_cogs + 250000d + (60000d - 20000d) + 3000d + 100000d + 67000d
$ex_ni = 1200000d - $ex_exp
$ex_bs_d = 1000000d + 300000d + 180000d + 500000d + 20000d
$ex_bs_c = 200000d + 6000d + 200000d + 27000d + 1300000d + 197000d
Assert-Equal 670000d $ex_cogs "Ex COGS"
Assert-Equal 1130000d $ex_exp "Ex Total Exp"
Assert-Equal 70000d $ex_ni "Ex NI"
Assert-Equal $ex_ni ($ex_bs_d - $ex_bs_c) "Ex BS/PL NI Match"

# Q1
$q1_pre_d = 800000d + 200000d + 100000d + 600000d + 620000d + 180000d
$q1_pre_c = 300000d + 2000d + 150000d + 300000d + 700000d + 148000d + 900000d
Assert-Equal 2500000d $q1_pre_d "Q1 Pre-TB Debit"
Assert-Equal $q1_pre_d $q1_pre_c "Q1 Pre-TB Match"

$q1_cogs = 100000d + 620000d - 120000d
$q1_dep = (600000d - 150000d) * 0.20d
$q1_exp = $q1_cogs + 180000d + 2000d + $q1_dep + 8000d
$q1_ni = 900000d - $q1_exp
$q1_net_assets = 800000d + (200000d - 4000d) + 120000d + (600000d - (150000d + $q1_dep))
$q1_net_l_eq = 300000d + 300000d + 8000d + 700000d + (148000d + $q1_ni)
Assert-Equal 600000d $q1_cogs "Q1 COGS"
Assert-Equal 90000d $q1_dep "Q1 Dep"
Assert-Equal 20000d $q1_ni "Q1 NI"
Assert-Equal 1476000d $q1_net_assets "Q1 Net Assets"
Assert-Equal $q1_net_assets $q1_net_l_eq "Q1 Net BS Match"

# Q2
$q2_rev = 800000d + 10000d
$q2_exp = 550000d + 220000d + 60000d + 30000d
$q2_loss = $q2_exp - $q2_rev
$q2_end_re = 180000d - $q2_loss
Assert-Equal 50000d $q2_loss "Q2 Net Loss"
Assert-Equal 130000d $q2_end_re "Q2 End RE"

# Q3
$q3_b = 1500000d - 600000d
$q3_a = 200000d + 950000d - $q3_b
$q3_d = 2400000d - 900000d - 1000000d - 380000d
$q3_c = 600000d - 430000d - $q3_d
Assert-Equal 900000d $q3_b "Q3 B (COGS)"
Assert-Equal 250000d $q3_a "Q3 A (End Inv)"
Assert-Equal 120000d $q3_d "Q3 D (NI)"
Assert-Equal 50000d $q3_c "Q3 C (Dep)"

foreach ($tok in @("1,130,000", "2,000,000", "1,930,000", "600,000", "1,476,000", "860,000", "130,000", "250,000", "50,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L3-10 CrossCheck $tok"
}

Write-Host "[Test-L3-10] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
