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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "02_level2_commercial\L2C-06_securities_accounting.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_trad = 540000d - 510000d
$ex_htm = (1000000d - 950000d) / 5d
$ex_acc = (1000000d * 0.0365d * 50d) / 365d
Assert-Equal 30000d $ex_trad "Ex Trad"
Assert-Equal 10000d $ex_htm "Ex HTM"
Assert-Equal 5000d $ex_acc "Ex Accrued Int"

# Q1
$q1_trad_loss = 400000d - 370000d
$q1_htm_amort = (2000000d - 1920000d) / 4d
$q1_htm_end = 1920000d + $q1_htm_amort
$q1_oth_diff = 650000d - 600000d
Assert-Equal 30000d $q1_trad_loss "Q1 Trad Loss"
Assert-Equal 20000d $q1_htm_amort "Q1 HTM Amort"
Assert-Equal 1940000d $q1_htm_end "Q1 HTM End"
Assert-Equal 50000d $q1_oth_diff "Q1 Oth Diff"

# Q2
$q2_coup = (1000000d * 0.0365d * 6d) / 12d
$q2_amort = ((1000000d - 952000d) * 6d) / 48d
$q2_end = 952000d + $q2_amort
$q2_acc = (1000000d * 0.0365d * 100d) / 365d
$q2_sale_gain = 340000d - 300000d
Assert-Equal 18250d $q2_coup "Q2 Coupon"
Assert-Equal 6000d $q2_amort "Q2 Amort"
Assert-Equal 958000d $q2_end "Q2 End"
Assert-Equal 10000d $q2_acc "Q2 Accrued"
Assert-Equal 40000d $q2_sale_gain "Q2 Sale Gain"

# Q3
$q3_trad_tot = (1150000d - 1000000d) + (1220000d - 1150000d)
$q3_oth_tot = 1220000d - 1000000d
Assert-Equal 220000d $q3_trad_tot "Q3 Trad Total"
Assert-Equal $q3_trad_tot $q3_oth_tot "Q3 Total Match"

foreach ($tok in @("985,000", "370,000", "1,940,000", "18,250", "958,000", "40,000", "220,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2C-06 CrossCheck $tok"
}

Write-Host "[Test-L2C-06] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
