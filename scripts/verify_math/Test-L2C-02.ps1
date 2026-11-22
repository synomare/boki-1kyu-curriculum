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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "02_level2_commercial\L2C-02_revenue_recognition_basics.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_gp = (90000d + 2000d) - (54000d + 1200d)
$ex_srv = (240000d * 6d) / 12d
Assert-Equal 36800d $ex_gp "Ex GP"
Assert-Equal 120000d $ex_srv "Ex Service Rev"

# Q1
$q1_srv = (360000d * 4d) / 12d
Assert-Equal 120000d $q1_srv "Q1 Service Rev"

# Q2
$q2_sales = 380000d - 4000d
$q2_cogs = 228000d - 2400d
$q2_gp = $q2_sales - $q2_cogs
Assert-Equal 376000d $q2_sales "Q2 Final Sales"
Assert-Equal 225600d $q2_cogs "Q2 Final COGS"
Assert-Equal 150400d $q2_gp "Q2 Final GP"

# Q3
$q3_gp_adj = 500000d - 300000d
Assert-Equal 200000d $q3_gp_adj "Q3 GP Adj"

foreach ($tok in @("36,800", "120,000", "350,000", "376,000", "225,600", "150,400", "200,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2C-02 CrossCheck $tok"
}

Write-Host "[Test-L2C-02] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
