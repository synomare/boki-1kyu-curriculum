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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-12_foreign_currency_and_subsidiaries.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_ap_loss = 1000d * (145d - 140d)
$ex_fwd_gain = 1000d * (148d - 146d)
$ex_settle_loss = (146000d + 2000d) - 145000d
Assert-Equal 5000d $ex_ap_loss "Ex AP Loss"
Assert-Equal 2000d $ex_fwd_gain "Ex Fwd Gain"
Assert-Equal 3000d $ex_settle_loss "Ex Settle Loss"

# Q1
$q1_1 = 1100d * 150d
$q1_2 = 1000d * 150d
$q1_3 = 1100d * 150d
$q1_4 = 1000d * 140d
Assert-Equal 165000d $q1_1 "Q1 1"
Assert-Equal 150000d $q1_2 "Q1 2"
Assert-Equal 165000d $q1_3 "Q1 3"
Assert-Equal 140000d $q1_4 "Q1 4"

# Q2
$q2_s_na = (1500d - 300d) * 120d
$q2_s_cta = $q2_s_na - ((1000d * 100d) + (200d * 110d))
$q2_gw_amort = 20d * 110d
$q2_gw_end = 80d * 120d
$q2_gw_cta = $q2_gw_end - ((100d * 100d) - $q2_gw_amort)
$q2_par_cta = ($q2_s_cta * 0.80d) + $q2_gw_cta
$q2_nci = $q2_s_na * 0.20d
Assert-Equal 22000d $q2_s_cta "Q2 S CTA"
Assert-Equal 2200d $q2_gw_amort "Q2 GW Amort"
Assert-Equal 9600d $q2_gw_end "Q2 GW End"
Assert-Equal 1800d $q2_gw_cta "Q2 GW CTA"
Assert-Equal 19400d $q2_par_cta "Q2 Par CTA"
Assert-Equal 28800d $q2_nci "Q2 NCI"

# Q3
$q3_tot = (200d * 110d) + (100d * 105d) + (500d * 100d)
Assert-Equal 82500d $q3_tot "Q3 Branch Assets"

foreach ($tok in @("165,000", "150,000", "140,000", "22,000", "2,200", "9,600", "1,800", "19,400", "28,800", "82,500")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-12 CrossCheck $tok"
}

Write-Host "[Test-L1C-12] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0