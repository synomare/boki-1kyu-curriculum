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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "02_level2_commercial\L2C-11_head_office_and_branch.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_ho = 530000d - 40000d
$ex_br = 370000d + 120000d
$ex_beg_ip = (180000d * 20d) / 120d
$ex_end_ip = (360000d * 20d) / 120d
Assert-Equal 490000d $ex_ho "Ex HO"
Assert-Equal $ex_ho $ex_br "Ex Mirror Match"
Assert-Equal 30000d $ex_beg_ip "Ex Beg IP"
Assert-Equal 60000d $ex_end_ip "Ex End IP"

# Q1
$q1_br = 550000d + 180000d + 50000d
$q1_beg_ip = (150000d * 25d) / 125d
$q1_end_ip = (350000d * 25d) / 125d
Assert-Equal 780000d $q1_br "Q1 Mirror Match"
Assert-Equal 30000d $q1_beg_ip "Q1 Beg IP"
Assert-Equal 70000d $q1_end_ip "Q1 End IP"

# Q2
$q2_sales = 2000000d + 1200000d - 300000d
$q2_beg = 400000d + (140000d - 40000d)
$q2_pur = 1200000d + (800000d - 300000d)
$q2_end = 350000d + (200000d - 30000d)
$q2_cogs = $q2_beg + $q2_pur - $q2_end
$q2_gp = $q2_sales - $q2_cogs
$q2_gp_check = (2000000d - (400000d + 1200000d - 350000d)) + (1200000d - (140000d + 800000d - 200000d)) + 40000d - 30000d
Assert-Equal 2900000d $q2_sales "Q2 Sales"
Assert-Equal 1680000d $q2_cogs "Q2 COGS"
Assert-Equal 1220000d $q2_gp "Q2 GP"
Assert-Equal $q2_gp $q2_gp_check "Q2 GP Check"

# Q3
$q3_cost_miss = 180000d - ((180000d * 25d) / 125d)
Assert-Equal 144000d $q3_cost_miss "Q3 Net Cost Miss"

foreach ($tok in @("490,000", "780,000", "70,000", "2,900,000", "1,680,000", "1,220,000", "144,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2C-11 CrossCheck $tok"
}

Write-Host "[Test-L2C-11] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
