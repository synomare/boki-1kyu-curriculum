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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "01_level3\L3-02_cash_deposits_and_epayments.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_short = 120000d - 112000d
$ex_misc_loss = $ex_short - 5500d
$ex_petty_rep = 18000d + 7000d + 12000d
$ex_overdraft = 280000d - 100000d
Assert-Equal 2500d $ex_misc_loss "Ex Misc Loss"
Assert-Equal 37000d $ex_petty_rep "Ex Petty Rep"
Assert-Equal 180000d $ex_overdraft "Ex Overdraft"

# Q1
$q1_petty = 11000d + 9500d + 6500d
$q1_od = 230000d - 150000d
$q1_fee = 50000d * 0.03d
$q1_ar = 50000d - $q1_fee
Assert-Equal 27000d $q1_petty "Q1 Petty"
Assert-Equal 80000d $q1_od "Q1 Overdraft"
Assert-Equal 1500d $q1_fee "Q1 QR Fee"
Assert-Equal 48500d $q1_ar "Q1 QR AR"

# Q2
$q2_over = 97000d - 85000d
$q2_misc_gain = $q2_over - 9000d
$q2_short_331 = 140000d - 134500d
$q2_misc_loss = $q2_short_331 - 4000d
Assert-Equal 3000d $q2_misc_gain "Q2 Misc Gain"
Assert-Equal 1500d $q2_misc_loss "Q2 Misc Loss"

# Q3
$q3_cash_dep = 60000d + 15000d + 250000d + 400000d
$q3_od = 120000d
$q3_supplies = 8000d + 12000d
$q3_lt_dep = 500000d
Assert-Equal 725000d $q3_cash_dep "Q3 Cash and Deposits"
Assert-Equal 120000d $q3_od "Q3 Overdraft"
Assert-Equal 20000d $q3_supplies "Q3 Supplies"
Assert-Equal 500000d $q3_lt_dep "Q3 LT Deposit"

foreach ($tok in @("2,500", "37,000", "180,000", "27,000", "48,500", "3,000", "134,500", "725,000", "20,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L3-02 CrossCheck $tok"
}

Write-Host "[Test-L3-02] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
