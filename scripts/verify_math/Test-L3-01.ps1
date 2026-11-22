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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "01_level3\L3-01_elements_and_double_entry.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Section 2 Parallel Example
$ex_cash = 1000000d + 500000d - 300000d + 600000d - 400000d
$ex_equip = 300000d
$ex_assets = $ex_cash + $ex_equip
$ex_liab = 500000d
$ex_cap = 1000000d
$ex_ni = 600000d - (150000d + 250000d)
Assert-Equal 1400000d $ex_cash "Ex Cash"
Assert-Equal 200000d $ex_ni "Ex Net Income"
Assert-Equal 1700000d $ex_assets "Ex Assets"
Assert-Equal $ex_assets ($ex_liab + $ex_cap + $ex_ni) "Ex BS Balance"

# Q1
$q1_cash = 400000d + 150000d - 100000d + 300000d + 500000d - 180000d
$q1_ar = 200000d - 150000d
$q1_ap = 150000d - 100000d
$q1_debt = 300000d
$q1_cap = 450000d
$q1_ni = 500000d - (120000d + 60000d)
$q1_assets = $q1_cash + $q1_ar
$q1_l_eq = $q1_ap + $q1_debt + $q1_cap + $q1_ni
Assert-Equal 1070000d $q1_cash "Q1 Cash"
Assert-Equal 320000d $q1_ni "Q1 NI"
Assert-Equal 1120000d $q1_assets "Q1 Assets"
Assert-Equal $q1_assets $q1_l_eq "Q1 BS Balance"

# Q2
$q2_beg_eq = 1200000d - 400000d
$q2_ni = 450000d - (10000d + 260000d)
$q2_assets = 1200000d + 300000d - 210000d + 450000d + 250000d - 260000d
$q2_liab = 400000d - 200000d + 250000d
$q2_end_eq = $q2_beg_eq + 300000d + $q2_ni
Assert-Equal 180000d $q2_ni "Q2 NI"
Assert-Equal 1730000d $q2_assets "Q2 Assets"
Assert-Equal 450000d $q2_liab "Q2 Liab"
Assert-Equal 1280000d $q2_end_eq "Q2 Equity"
Assert-Equal ($q2_assets - $q2_liab) $q2_end_eq "Q2 BS Match"

# Q3
$q3_beg_eq = 2000000d - 700000d
$q3_end_eq = 2950000d - 1050000d
$q3_ni = $q3_end_eq - ($q3_beg_eq + 400000d - 150000d)
$q3_rev = 1450000d + $q3_ni
Assert-Equal 1300000d $q3_beg_eq "Q3 Beg Eq"
Assert-Equal 1900000d $q3_end_eq "Q3 End Eq"
Assert-Equal 350000d $q3_ni "Q3 NI"
Assert-Equal 1800000d $q3_rev "Q3 Rev"

foreach ($tok in @("1,400,000", "1,700,000", "1,070,000", "1,120,000", "320,000", "1,730,000", "1,280,000", "350,000", "1,800,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L3-01 CrossCheck $tok"
}

Write-Host "[Test-L3-01] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
