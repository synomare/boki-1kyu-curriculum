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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "03_level2_industrial\L2I-04_job_order_costing.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_101 = 120000d + 80000d + 60000d + 60000d
$ex_102 = 150000d + 120000d + 120000d
$ex_103 = 90000d + 70000d + 75000d
Assert-Equal 320000d $ex_101 "Ex 101"
Assert-Equal 390000d $ex_102 "Ex 102"
Assert-Equal 235000d $ex_103 "Ex 103"
Assert-Equal 710000d ($ex_101 + $ex_102) "Ex Finished"

# Q1
$q1_201 = 180000d + 100000d + (50d * 2000d) + (40d * 1200d)
$q1_202 = 200000d + (90d * 2000d) + (75d * 1200d)
$q1_203 = 140000d + (60d * 2000d) + (50d * 1200d)
Assert-Equal 428000d $q1_201 "Q1 201"
Assert-Equal 470000d $q1_202 "Q1 202"
Assert-Equal 320000d $q1_203 "Q1 203"
Assert-Equal 898000d ($q1_201 + $q1_202) "Q1 Finished"

# Q2
$q2_a = (500000d - 40000d) + 480000d
$q2_b = 300000d + 35000d
$q2_c = (180000d + 120000d) - 15000d
Assert-Equal 940000d $q2_a "Q2 Case A"
Assert-Equal 335000d $q2_b "Q2 Case B"
Assert-Equal 285000d $q2_c "Q2 Case C"

# Q3
$q3_oh_401 = (120000d * 100d) / 400d
$q3_oh_402 = (120000d * 300d) / 400d
Assert-Equal 30000d $q3_oh_401 "Q3 OH 401"
Assert-Equal 90000d $q3_oh_402 "Q3 OH 402"

foreach ($tok in @("710,000", "428,000", "470,000", "320,000", "898,000", "940,000", "335,000", "285,000", "90,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2I-04 CrossCheck $tok"
}

Write-Host "[Test-L2I-04] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0