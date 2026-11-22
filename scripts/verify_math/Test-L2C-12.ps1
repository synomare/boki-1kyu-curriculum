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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "02_level2_commercial\L2C-12_consolidation_basics.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_gw = 1000000d - (1100000d * 0.80d)
$ex_nci0 = 1100000d * 0.20d
$ex_nci1 = $ex_nci0 + (150000d * 0.20d) - (50000d * 0.20d)
Assert-Equal 120000d $ex_gw "Ex Goodwill"
Assert-Equal 220000d $ex_nci0 "Ex NCI0"
Assert-Equal 240000d $ex_nci1 "Ex NCI1"

# Q1
$q1_gw0 = 900000d - (1100000d * 0.70d)
$q1_gw2 = $q1_gw0 - (13000d * 2d)
$q1_nci0 = 1100000d * 0.30d
$q1_nci1 = $q1_nci0 + (200000d * 0.30d) - (100000d * 0.30d)
$q1_nci2 = $q1_nci1 + (300000d * 0.30d) - (100000d * 0.30d)
Assert-Equal 130000d $q1_gw0 "Q1 GW0"
Assert-Equal 104000d $q1_gw2 "Q1 GW2"
Assert-Equal 330000d $q1_nci0 "Q1 NCI0"
Assert-Equal 360000d $q1_nci1 "Q1 NCI1"
Assert-Equal 420000d $q1_nci2 "Q1 NCI2"

# Q2
$q2_allow = 200000d * 0.03d
$q2_up_nci = 30000d * 0.20d
$q2_land = 620000d - 500000d
Assert-Equal 6000d $q2_allow "Q2 Allowance"
Assert-Equal 6000d $q2_up_nci "Q2 Up NCI"
Assert-Equal 120000d $q2_land "Q2 Land"

# Q3
$q3_ni_tot = 400000d + 300000d - 70000d - 13000d - 20000d
$q3_ni_nci = (300000d * 0.30d) - (20000d * 0.30d)
$q3_ni_par = $q3_ni_tot - $q3_ni_nci
$q3_end_re = 1500000d + ((600000d - 300000d) * 0.70d) - 26000d - (20000d * 0.70d)
Assert-Equal 597000d $q3_ni_tot "Q3 Total NI"
Assert-Equal 84000d $q3_ni_nci "Q3 NCI NI"
Assert-Equal 513000d $q3_ni_par "Q3 Parent NI"
Assert-Equal 1670000d $q3_end_re "Q3 End Consolidated RE"

foreach ($tok in @("108,000", "240,000", "104,000", "420,000", "597,000", "84,000", "513,000", "1,670,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2C-12 CrossCheck $tok"
}

Write-Host "[Test-L2C-12] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
