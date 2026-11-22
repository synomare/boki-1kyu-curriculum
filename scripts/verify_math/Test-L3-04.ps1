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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "01_level3\L3-04_receivables_payables_and_er.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_net_pay = 300000d - 24000d - 45000d
$ex_si_total = 45000d + 45000d
$ex_int = (600000d * 0.03d * 8d) / 12d
Assert-Equal 231000d $ex_net_pay "Ex Net Pay"
Assert-Equal 90000d $ex_si_total "Ex SI Total"
Assert-Equal 12000d $ex_int "Ex Interest"

# Q1
$q1_ar_rem = 400000d - 80000d
$q1_net_pay = 400000d - 32000d - 58000d
$q1_si_total = 58000d + 58000d
Assert-Equal 320000d $q1_ar_rem "Q1 AR Rem"
Assert-Equal 310000d $q1_net_pay "Q1 Net Pay"
Assert-Equal 116000d $q1_si_total "Q1 SI Total"

# Q2
$q2_int = (800000d * 0.045d * 4d) / 12d
$q2_tot = 800000d + $q2_int
Assert-Equal 12000d $q2_int "Q2 Interest"
Assert-Equal 812000d $q2_tot "Q2 Principal+Interest"

# Q3
$q3_op_adj = 80000d - 110000d
$q3_end_adv = 120000d + 100000d - 80000d
Assert-Equal (-30000d) $q3_op_adj "Q3 OP Adj"
Assert-Equal 140000d $q3_end_adv "Q3 End Advances Received"

foreach ($tok in @("231,000", "612,000", "320,000", "310,000", "116,000", "812,000", "140,000", "30,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L3-04 CrossCheck $tok"
}

Write-Host "[Test-L3-04] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
