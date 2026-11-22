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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "05_level1_industrial\L1I-03_joint_products_and_byproducts.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_a = (700000d * 600d) / 1000d
$ex_b = (700000d * 400d) / 1000d
Assert-Equal 420000d $ex_a "Ex A"
Assert-Equal 280000d $ex_b "Ex B"

# Q1
$q1_net = 850000d - (60000d - 10000d)
$q1_x_j = ($q1_net * 600d) / 1000d
$q1_y_j = ($q1_net * 400d) / 1000d
$q1_x_tot = $q1_x_j + 300000d
$q1_y_tot = $q1_y_j + 100000d
Assert-Equal 800000d $q1_net "Q1 Net"
Assert-Equal 480000d $q1_x_j "Q1 X Joint"
Assert-Equal 320000d $q1_y_j "Q1 Y Joint"
Assert-Equal 780000d $q1_x_tot "Q1 X Tot"
Assert-Equal 420000d $q1_y_tot "Q1 Y Tot"

# Q2
$q2_p = (520000d - 300000d) - 180000d
$q2_q = (320000d - 200000d) - 150000d
Assert-Equal 40000d $q2_p "Q2 P"
Assert-Equal (-30000d) $q2_q "Q2 Q"

# Q3
$q3_phys_n = 300000d - ((600000d * 200d) / 300d)
$q3_nrv_m = 900000d - ((600000d * 900d) / 1200d)
$q3_nrv_n = 300000d - ((600000d * 300d) / 1200d)
Assert-Equal (-100000d) $q3_phys_n "Q3 Phys N"
Assert-Equal 450000d $q3_nrv_m "Q3 NRV M"
Assert-Equal 150000d $q3_nrv_n "Q3 NRV N"

foreach ($tok in @("540,000", "480,000", "800,000", "780,000", "420,000", "40,000", "30,000", "100,000", "450,000", "150,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1I-03 CrossCheck $tok"
}

Write-Host "[Test-L1I-03] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0