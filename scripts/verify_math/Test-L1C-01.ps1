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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-01_conceptual_framework_and_changes.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_inv_diff = 400000d - 360000d
$ex_re = $ex_inv_diff * 0.70d
$ex_dta = $ex_inv_diff * 0.30d
$ex_dep = 800000d / 4d
Assert-Equal 28000d $ex_re "Ex RE"
Assert-Equal 12000d $ex_dta "Ex DTA"
Assert-Equal 200000d $ex_dep "Ex Dep"

# Q1
$q1_oci1 = (380000d - 300000d) * 0.70d
$q1_ci1 = 400000d + $q1_oci1
$q1_rcyc = (-56000d)
$q1_ci2 = 500000d + $q1_rcyc
Assert-Equal 56000d $q1_oci1 "Q1 OCI1"
Assert-Equal 456000d $q1_ci1 "Q1 CI1"
Assert-Equal 444000d $q1_ci2 "Q1 CI2"
Assert-Equal ($q1_ci1 + $q1_ci2) (400000d + 500000d) "Q1 Clean Surplus"

# Q2
$q2_a = 800000d / 2d
$q2_b = 800000d * 0.50d
Assert-Equal 400000d $q2_a "Q2A"
Assert-Equal 400000d $q2_b "Q2B"

# Q3
$q3_ni1 = 300000d - (20000d * 0.70d)
$q3_ni2 = 350000d - (40000d * 0.70d) - (40000d * 0.70d)
$q3_cum = (-14000d) + (-28000d) + (-28000d)
$q3_re3 = 650000d + $q3_cum
Assert-Equal 286000d $q3_ni1 "Q3 NI1"
Assert-Equal 294000d $q3_ni2 "Q3 NI2"
Assert-Equal (-70000d) $q3_cum "Q3 Cum"
Assert-Equal 580000d $q3_re3 "Q3 RE3"
Assert-Equal ($q3_ni1 + $q3_ni2) $q3_re3 "Q3 CrossCheck"

foreach ($tok in @("456,000", "444,000", "400,000", "286,000", "294,000", "580,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-01 CrossCheck $tok"
}

Write-Host "[Test-L1C-01] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0