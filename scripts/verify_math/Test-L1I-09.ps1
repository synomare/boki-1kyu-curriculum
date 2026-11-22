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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "05_level1_industrial\L1I-09_operational_decision_making.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_diff = 1500000d - (900000d + 150000d + 200000d)
Assert-Equal 250000d $ex_diff "Ex Diff"

# Q1
$q1_make = (5000d * 400d) + 500000d
$q1_buy = 5000d * 580d
$q1_a = $q1_buy - $q1_make
$q1_b = ($q1_make + 550000d) - $q1_buy
Assert-Equal 400000d $q1_a "Q1A"
Assert-Equal 150000d $q1_b "Q1B"

# Q2
$q2_eoq = [decimal][Math]::Sqrt((2.0 * 20000.0 * 2500.0) / 100.0)
$q2_tot = ((20000d / $q2_eoq) * 2500d) + (($q2_eoq / 2d) * 100d)
$q2_rop = (80d * 5d) + 150d
Assert-Equal 1000d $q2_eoq "Q2 EOQ"
Assert-Equal 100000d $q2_tot "Q2 Total Cost"
Assert-Equal 550d $q2_rop "Q2 ROP"

# Q3
$q3_min = 1250000d / 1000d
Assert-Equal 1250d $q3_min "Q3 Min Price"

foreach ($tok in @("250,000", "400,000", "150,000", "1,000", "100,000", "550", "1,250")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1I-09 CrossCheck $tok"
}

Write-Host "[Test-L1I-09] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0