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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "03_level2_industrial\L2I-03_overhead_and_departmental.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_app = 1000d * 900d
$ex_allow = 600000d + (400d * 900d)
$ex_bud_v = $ex_allow - 990000d
$ex_vol_v = $ex_app - $ex_allow
Assert-Equal 900000d $ex_app "Ex Applied"
Assert-Equal 960000d $ex_allow "Ex Allowed"
Assert-Equal (-30000d) $ex_bud_v "Ex Budget Var"
Assert-Equal (-60000d) $ex_vol_v "Ex Volume Var"

# Q1
$q1_rate = (1200000d / 2000d) + 500d
$q1_app = $q1_rate * 2100d
$q1_allow = 1200000d + (500d * 2100d)
$q1_bud_v = $q1_allow - 2220000d
$q1_vol_v = $q1_app - $q1_allow
Assert-Equal 1100d $q1_rate "Q1 Rate"
Assert-Equal 2310000d $q1_app "Q1 Applied"
Assert-Equal 2250000d $q1_allow "Q1 Allowed"
Assert-Equal 30000d $q1_bud_v "Q1 Bud Var"
Assert-Equal 60000d $q1_vol_v "Q1 Vol Var"

# Q2
$q2_dir_cut = 500000d + (200000d * 40d / 80d) + (160000d * 50d / 80d)
$q2_dir_asm = 400000d + (200000d * 40d / 80d) + (160000d * 30d / 80d)
Assert-Equal 700000d $q2_dir_cut "Q2 Direct Cut"
Assert-Equal 560000d $q2_dir_asm "Q2 Direct Asm"

$q2_mut_cut = 500000d + (200000d * 0.40d) + (160000d * 0.50d) + (32000d * 0.50d) + (40000d * 5d / 8d)
$q2_mut_asm = 400000d + (200000d * 0.40d) + (160000d * 0.30d) + (32000d * 0.50d) + (40000d * 3d / 8d)
Assert-Equal 701000d $q2_mut_cut "Q2 Mutual Cut"
Assert-Equal 559000d $q2_mut_asm "Q2 Mutual Asm"

# Q3
$q3_rate = 880000d / 800d
$q3_fix_r = 140000d / (1000d - 800d)
$q3_fix_bud = $q3_fix_r * 1000d
$q3_var_r = $q3_rate - $q3_fix_r
$q3_allow = $q3_fix_bud + ($q3_var_r * 800d)
$q3_bud_v = $q3_allow - 960000d
$q3_fixed_bud_v = ($q3_rate * 1000d) - 960000d
Assert-Equal 1100d $q3_rate "Q3 Rate"
Assert-Equal 700000d $q3_fix_bud "Q3 Fixed Budget"
Assert-Equal 400d $q3_var_r "Q3 Var Rate"
Assert-Equal 1020000d $q3_allow "Q3 Allowed"
Assert-Equal 60000d $q3_bud_v "Q3 Bud Var"
Assert-Equal 140000d $q3_fixed_bud_v "Q3 Fixed Budget Var"

foreach ($tok in @("960,000", "2,310,000", "2,250,000", "700,000", "560,000", "701,000", "559,000", "1,020,000", "1,100,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2I-03 CrossCheck $tok"
}

Write-Host "[Test-L2I-03] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0