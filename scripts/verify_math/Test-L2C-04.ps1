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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "02_level2_commercial\L2C-04_advanced_fixed_assets_basics.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_prod = ((2000000d - 200000d) * 25000d) / 100000d
$ex_comp_dep = (1000000d - 400000d) / 5d
$ex_int = (1100000d - 1000000d) / 5d
Assert-Equal 450000d $ex_prod "Ex Prod Dep"
Assert-Equal 120000d $ex_comp_dep "Ex Comp Dep"
Assert-Equal 20000d $ex_int "Ex Inst Int"

# Q1
$q1_prod = (3000000d * 12000d) / 60000d
$q1_comp_dep = (1500000d - 600000d) / 5d
$q1_pat = 400000d / 8d
Assert-Equal 600000d $q1_prod "Q1 Prod Dep"
Assert-Equal 180000d $q1_comp_dep "Q1 Comp Dep"
Assert-Equal 50000d $q1_pat "Q1 Patent"

# Q2
$q2_ins_gain = 1300000d - (1200000d - 400000d)
$q2_new_dep = (1300000d - $q2_ins_gain) / 10d
$q2_int = (1320000d - 1200000d) / 4d
Assert-Equal 500000d $q2_ins_gain "Q2 Ins Gain"
Assert-Equal 80000d $q2_new_dep "Q2 New Dep"
Assert-Equal 30000d $q2_int "Q2 Inst Int"

# Q3
$q3_no_y1 = (400000d + 500000d - 200000d) * 0.30d
$q3_no_y2 = (400000d - 200000d) * 0.30d
$q3_no_tot = $q3_no_y1 + ($q3_no_y2 * 4d)
$q3_yes_y = (400000d - 100000d) * 0.30d
$q3_yes_tot = $q3_yes_y * 5d
Assert-Equal 210000d $q3_no_y1 "Q3 No Comp Y1"
Assert-Equal 60000d $q3_no_y2 "Q3 No Comp Y2"
Assert-Equal 450000d $q3_no_tot "Q3 No Comp Total"
Assert-Equal 90000d $q3_yes_y "Q3 Comp Yearly"
Assert-Equal $q3_no_tot $q3_yes_tot "Q3 5Y Tax Match"

foreach ($tok in @("450,000", "120,000", "600,000", "180,000", "80,000", "30,000", "210,000", "90,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2C-04 CrossCheck $tok"
}

Write-Host "[Test-L2C-04] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
