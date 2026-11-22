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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-14_consolidation_income_oci_and_cf.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_gain = 400000d - 380000d
Assert-Equal 20000d $ex_gain "Ex Gain"

# Q1
$q1_gain = 700000d - 500000d
$q1_dep = (700000d - 500000d) / 5d
$q1_nci = ($q1_gain - $q1_dep) * 0.20d
Assert-Equal 200000d $q1_gain "Q1 Gain"
Assert-Equal 40000d $q1_dep "Q1 Dep"
Assert-Equal 32000d $q1_nci "Q1 NCI"

# Q2
$q2_oci = 100000d + 50000d - 100000d
$q2_ci = 600000d + $q2_oci
$q2_par = 520000d + 100000d + (50000d * 0.80d) - (100000d * 0.80d)
$q2_nci = 80000d + (50000d * 0.20d) - (100000d * 0.20d)
Assert-Equal 50000d $q2_oci "Q2 OCI"
Assert-Equal 650000d $q2_ci "Q2 CI"
Assert-Equal 580000d $q2_par "Q2 Par"
Assert-Equal 70000d $q2_nci "Q2 NCI"

# Q3
$q3_in = 500000d + 100000d + 20000d - 150000d + 50000d + 80000d - 140000d
$q3_dir = (2000000d - 150000d) - ((1200000d - 50000d) - 80000d) - 180000d - 140000d
Assert-Equal 460000d $q3_in "Q3 Indirect"
Assert-Equal 460000d $q3_dir "Q3 Direct"

foreach ($tok in @("20,000", "32,000", "650,000", "580,000", "70,000", "600,000", "460,000", "1,850,000", "1,070,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-14 CrossCheck $tok"
}

Write-Host "[Test-L1C-14] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0