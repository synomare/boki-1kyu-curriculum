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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "02_level2_commercial\L2C-08_foreign_currency_basics.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_ar_end = 1000d * 145d
$ex_res = 2000d * (146d - 140d)
Assert-Equal 145000d $ex_ar_end "Ex AR End"
Assert-Equal 12000d $ex_res "Ex Res Loss"

# Q1
$q1_ap_gain = 3000d * (145d - 140d)
$q1_ar_gain = 4000d * (152d - 148d)
$q1_ar_loss = 4000d * (152d - 150d)
Assert-Equal 15000d $q1_ap_gain "Q1 AP Gain"
Assert-Equal 16000d $q1_ar_gain "Q1 AR Gain"
Assert-Equal 8000d $q1_ar_loss "Q1 AR Loss"

# Q2
$q2_pur = (1000d * 140d) + (4000d * 146d)
$q2_res = 4000d * (148d - 146d)
Assert-Equal 724000d $q2_pur "Q2 Purchase"
Assert-Equal 8000d $q2_res "Q2 Res Loss"

# Q3
$q3_spot = 5000d * (143d - 140d)
$q3_fwd = 5000d * (149d - 143d)
$q3_y1_fwd = ($q3_fwd * 4d) / 6d
$q3_y2_fwd = ($q3_fwd * 2d) / 6d
$q3_y1 = $q3_spot + $q3_y1_fwd
$q3_tot = $q3_y1 + $q3_y2_fwd
Assert-Equal 15000d $q3_spot "Q3 Spot Diff"
Assert-Equal 30000d $q3_fwd "Q3 Fwd Diff"
Assert-Equal 35000d $q3_y1 "Q3 Y1 Gain"
Assert-Equal 10000d $q3_y2_fwd "Q3 Y2 Gain"
Assert-Equal 45000d $q3_tot "Q3 Total Gain"

foreach ($tok in @("292,000", "435,000", "592,000", "724,000", "35,000", "45,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2C-08 CrossCheck $tok"
}

Write-Host "[Test-L2C-08] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
