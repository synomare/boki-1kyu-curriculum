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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "02_level2_commercial\L2C-01_bank_reconciliation_and_factoring.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_co = 1200000d - 5000d + 150000d + 9000d
$ex_bk = 1280000d + 74000d
$ex_disc = (600000d * 0.05d * 73d) / 365d
$ex_fact_fee = 500000d * 0.04d
Assert-Equal 1354000d $ex_co "Ex Co Bank"
Assert-Equal $ex_co $ex_bk "Ex Bank Match"
Assert-Equal 6000d $ex_disc "Ex ER Discount"
Assert-Equal 20000d $ex_fact_fee "Ex Factoring Fee"

# Q1
$q1_co = 850000d - 3000d + 120000d + 54000d
$q1_bk = 910000d + 111000d
Assert-Equal 1021000d $q1_co "Q1 Co Bank"
Assert-Equal $q1_co $q1_bk "Q1 Bank Match"

# Q2
$q2_disc = (1000000d * 0.025d * 146d) / 365d
$q2_net_er = 1000000d - $q2_disc
$q2_fact_fee = 400000d * 0.05d
$q2_net_fact = 400000d - $q2_fact_fee
Assert-Equal 10000d $q2_disc "Q2 Discount"
Assert-Equal 990000d $q2_net_er "Q2 Net ER"
Assert-Equal 20000d $q2_fact_fee "Q2 Fact Fee"
Assert-Equal 380000d $q2_net_fact "Q2 Net Fact"

# Q3
$q3_x = 1620000d - 1500000d
$q3_y = 1620000d - (-12000d + 80000d + (38000d - 20000d))
Assert-Equal 120000d $q3_x "Q3 X"
Assert-Equal 1534000d $q3_y "Q3 Y"

foreach ($tok in @("1,354,000", "594,000", "480,000", "1,021,000", "990,000", "380,000", "120,000", "1,534,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2C-01 CrossCheck $tok"
}

Write-Host "[Test-L2C-01] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
