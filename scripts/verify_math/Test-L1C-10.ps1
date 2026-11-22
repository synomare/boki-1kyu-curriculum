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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-10_equity_treasury_and_stock_options.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_cap_surp = 30000d - (60000d - 48000d) - 40000d
$ex_comp = -$ex_cap_surp
$ex_re = 400000d - $ex_comp
Assert-Equal 22000d $ex_comp "Ex Comp"
Assert-Equal 378000d $ex_re "Ex RE"

# Q1
$q1_cap = (150000d * 40d) / 100d
$q1_surp = ((150000d * 60d) / 100d) - 72000d
Assert-Equal 60000d $q1_cap "Q1 Cap"
Assert-Equal 18000d $q1_surp "Q1 Surp"

# Q2
$q2_x1 = (90d * 5000d * 1d) / 2d
$q2_x2_tot = 80d * 5000d
$q2_x2 = $q2_x2_tot - $q2_x1
$q2_ex = (70d * 10000d) + (70d * 5000d)
$q2_forf = 10d * 5000d
Assert-Equal 225000d $q2_x1 "Q2 X1"
Assert-Equal 175000d $q2_x2 "Q2 X2"
Assert-Equal 1050000d $q2_ex "Q2 Ex"
Assert-Equal 50000d $q2_forf "Q2 Forf"

# Q3
$q3_surp_tot = 150000d + 550000d
$q3_ded = 100000d + 30000d
$q3_gw_adj = (320000d * 0.50d) + 80000d
$q3_dist1 = $q3_surp_tot - $q3_ded
$q3_adj2 = $q3_gw_adj - 150000d
$q3_dist2 = $q3_dist1 - $q3_adj2
Assert-Equal 570000d $q3_dist1 "Q3 Dist1"
Assert-Equal 90000d $q3_adj2 "Q3 Adj2"
Assert-Equal 480000d $q3_dist2 "Q3 Dist2"

foreach ($tok in @("22,000", "378,000", "60,000", "18,000", "225,000", "175,000", "1,050,000", "570,000", "90,000", "480,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-10 CrossCheck $tok"
}

Write-Host "[Test-L1C-10] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0