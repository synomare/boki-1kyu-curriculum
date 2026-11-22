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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "02_level2_commercial\L2C-05_new_lease_accounting_basics.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_dep_ex = 1000000d / 5d
$ex_int_ex = (1200000d - 1000000d) / 5d
$ex_dep_in = 1200000d / 5d
Assert-Equal 200000d $ex_dep_ex "Ex Dep Excl"
Assert-Equal 40000d $ex_int_ex "Ex Int Excl"
Assert-Equal 240000d $ex_dep_in "Ex Dep Incl"

# Q1
$q1_ex_dep = 1040000d / 4d
$q1_ex_int = (1200000d - 1040000d) / 4d
$q1_ex_end = 1040000d - $q1_ex_dep
$q1_in_dep = 1200000d / 4d
$q1_in_end = 1200000d - $q1_in_dep
Assert-Equal 260000d $q1_ex_dep "Q1 Ex Dep"
Assert-Equal 40000d $q1_ex_int "Q1 Ex Int"
Assert-Equal 780000d $q1_ex_end "Q1 Ex End"
Assert-Equal 300000d $q1_in_dep "Q1 In Dep"
Assert-Equal 900000d $q1_in_end "Q1 In End"

# Q2
$q2_store_dep = (5400000d / 5d) * (6d / 12d)
$q2_store_int = (120000d * 6d) / 12d
$q2_short = 20000d * 6d
$q2_small_pre = (60000d * 6d) / 12d
Assert-Equal 540000d $q2_store_dep "Q2 Store Dep"
Assert-Equal 60000d $q2_store_int "Q2 Store Int"
Assert-Equal 120000d $q2_short "Q2 Short"
Assert-Equal 30000d $q2_small_pre "Q2 Small Prepaid"

# Q3
$q3_op_diff = 600000d - (2500000d / 5d)
$q3_ord_diff = 600000d - ((2500000d / 5d) + 100000d)
Assert-Equal 100000d $q3_op_diff "Q3 OP Diff"
Assert-Equal 0d $q3_ord_diff "Q3 Ord Diff"

foreach ($tok in @("800,000", "1,040,000", "780,000", "900,000", "5,400,000", "540,000", "2,500,000", "100,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2C-05 CrossCheck $tok"
}

Write-Host "[Test-L2C-05] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
