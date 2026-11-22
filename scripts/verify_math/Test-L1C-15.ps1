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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-15_business_combinations_and_disclosure.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_gw = 600000d - (800000d - 300000d)
$ex_loss = 450000d - (700000d - 300000d)
Assert-Equal 100000d $ex_gw "Ex GW"
Assert-Equal 50000d $ex_loss "Ex Loss"

# Q1
$q1_gain = 550000d - (600000d - 200000d)
Assert-Equal 150000d $q1_gain "Q1 Gain"

# Q2
$q2_num = 1000000d - 100000d
$q2_den = 800d + (400d * 6d / 12d)
$q2_eps = $q2_num / $q2_den
$q2_adj_num = $q2_num + (100000d * 0.60d)
$q2_adj_den = $q2_den + 200d
$q2_deps = $q2_adj_num / $q2_adj_den
Assert-Equal 900d $q2_eps "Q2 EPS"
Assert-Equal 800d $q2_deps "Q2 DEPS"

# Q3
$q3_75 = (400d + 350d + 120d + 80d) / 1000d
Assert-Equal 0.95d $q3_75 "Q3 75pct Check"

foreach ($tok in @("100,000", "50,000", "150,000", "900,000", "900円", "800円", "95%")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-15 CrossCheck $tok"
}

Write-Host "[Test-L1C-15] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0