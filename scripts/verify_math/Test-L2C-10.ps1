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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "02_level2_commercial\L2C-10_tax_effect_basics.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_taxable = 1000000d + 100000d + 50000d
$ex_tax = $ex_taxable * 0.30d
$ex_dta = 100000d * 0.30d
$ex_net_tax = $ex_tax - $ex_dta
Assert-Equal 345000d $ex_tax "Ex Tax"
Assert-Equal 30000d $ex_dta "Ex DTA"
Assert-Equal 315000d $ex_net_tax "Ex Net Tax"

# Q1
$q1_taxable = 2000000d + 200000d + 100000d
$q1_tax = $q1_taxable * 0.30d
$q1_dta = 200000d * 0.30d
$q1_ni = 2000000d - ($q1_tax - $q1_dta)
Assert-Equal 2300000d $q1_taxable "Q1 Taxable"
Assert-Equal 690000d $q1_tax "Q1 Tax"
Assert-Equal 60000d $q1_dta "Q1 DTA"
Assert-Equal 1370000d $q1_ni "Q1 NI"

# Q2
$q2_end_temp = (100000d - 60000d) + 150000d
$q2_end_dta = $q2_end_temp * 0.30d
$q2_adj = $q2_end_dta - (100000d * 0.30d)
Assert-Equal 57000d $q2_end_dta "Q2 End DTA"
Assert-Equal 27000d $q2_adj "Q2 DTA Adj"

# Q3
$q3_taxable = 1500000d + 300000d - 100000d
$q3_tax = $q3_taxable * 0.30d
$q3_dta = 300000d * 0.30d
$q3_dtl = 100000d * 0.30d
$q3_adj = $q3_dta - $q3_dtl
$q3_ni = 1500000d - ($q3_tax - $q3_adj)
Assert-Equal 1700000d $q3_taxable "Q3 Taxable"
Assert-Equal 510000d $q3_tax "Q3 Tax"
Assert-Equal 60000d $q3_adj "Q3 Adj"
Assert-Equal 1050000d $q3_ni "Q3 NI"

foreach ($tok in @("345,000", "2,300,000", "690,000", "1,370,000", "57,000", "27,000", "510,000", "1,050,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2C-10 CrossCheck $tok"
}

Write-Host "[Test-L2C-10] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
