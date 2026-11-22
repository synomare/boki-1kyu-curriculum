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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "05_level1_industrial\L1I-04_advanced_standard_costing.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_p = ((400d - 410d) * 620d) + ((200d - 190d) * 480d)
$ex_mix = (400d * (660d - 620d)) + (200d * (440d - 480d))
$ex_yld = 320d * (1000d - 1100d)
Assert-Equal (-1400d) $ex_p "Ex Price"
Assert-Equal 8000d $ex_mix "Ex Mix"
Assert-Equal (-32000d) $ex_yld "Ex Yield"

# Q1
$q1_p = ((600d - 620d) * 450d) + ((300d - 300d) * 500d)
$q1_mix = (600d * (380d - 450d)) + (300d * (570d - 500d))
$q1_yld = 420d * (1000d - 950d)
Assert-Equal (-9000d) $q1_p "Q1 Price"
Assert-Equal (-21000d) $q1_mix "Q1 Mix"
Assert-Equal 21000d $q1_yld "Q1 Yield"

# Q2
$q2_wip = (120000d * 200000d) / 2000000d
$q2_fg = (120000d * 300000d) / 2000000d
$q2_cogs = (120000d * 1500000d) / 2000000d
Assert-Equal 12000d $q2_wip "Q2 WIP"
Assert-Equal 18000d $q2_fg "Q2 FG"
Assert-Equal 90000d $q2_cogs "Q2 COGS"

# Q3
$q3_rcp_var = (500d - 520d) * 1200d
$q3_qty_var = 500d * (1000d - 1050d)
Assert-Equal (-24000d) $q3_rcp_var "Q3 Rcp Var"
Assert-Equal (-25000d) $q3_qty_var "Q3 Qty Var"

foreach ($tok in @("345,400", "25,400", "8,000", "32,000", "9,000", "21,000", "12,000", "18,000", "90,000", "24,000", "25,000", "20,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1I-04 CrossCheck $tok"
}

Write-Host "[Test-L1I-04] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0