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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-04_derivatives_and_hedge_accounting.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_mat_cost = 1120000d - 120000d
Assert-Equal 1000000d $ex_mat_cost "Ex Mat Cost"

# Q1
$q1_net_eq = (-56000d) + 56000d
$q1_net_pl = (-80000d) + 80000d
Assert-Equal 0d $q1_net_eq "Q1 Net Eq"
Assert-Equal 0d $q1_net_pl "Q1 Net PL"

# Q2
$q2_int = 400000d - 100000d
$q2_def_h = 200000d * 0.70d
$q2_dtl = 200000d * 0.30d
Assert-Equal 300000d $q2_int "Q2 Int"
Assert-Equal 140000d $q2_def_h "Q2 Def H"
Assert-Equal 60000d $q2_dtl "Q2 DTL"

# Q3
$q3_all_dh = 80000d * 0.70d
$q3_int_dh = 100000d * 0.70d
$q3_time_pl = 30000d - 50000d
Assert-Equal 56000d $q3_all_dh "Q3 All DH"
Assert-Equal 70000d $q3_int_dh "Q3 Int DH"
Assert-Equal (-20000d) $q3_time_pl "Q3 Time PL"

foreach ($tok in @("70,000", "30,000", "84,000", "300,000", "140,000", "60,000", "56,000", "20,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-04 CrossCheck $tok"
}

Write-Host "[Test-L1C-04] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0