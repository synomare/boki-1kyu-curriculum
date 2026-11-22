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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "04_level1_commercial\L1C-06_impairment_intangibles_and_compression.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_viu = (420000d / 1.05d) + (441000d / 1.1025d)
$ex_imp = 1000000d - $ex_viu
Assert-Equal 800000d $ex_viu "Ex VIU"
Assert-Equal 200000d $ex_imp "Ex Imp"

# Q1
$q1_a = 500000d - 350000d
$q1_tot = 1200000d - 950000d
$q1_c = $q1_tot - $q1_a
Assert-Equal 150000d $q1_a "Q1A"
Assert-Equal 250000d $q1_tot "Q1 Tot"
Assert-Equal 100000d $q1_c "Q1C"

# Q2
$q2_x1_qty = (600000d * 400d) / 1000d
$q2_x1_str = 600000d / 3d
$q2_x1 = [Math]::Max($q2_x1_qty, $q2_x1_str)
$q2_rem1 = 600000d - $q2_x1
$q2_x2_qty = ($q2_rem1 * 150d) / 450d
$q2_x2_str = $q2_rem1 / 2d
$q2_x2 = [Math]::Max($q2_x2_qty, $q2_x2_str)
Assert-Equal 240000d $q2_x1 "Q2 X1"
Assert-Equal 360000d $q2_rem1 "Q2 Rem1"
Assert-Equal 180000d $q2_x2 "Q2 X2"

# Q3
$q3_dir_dep = 600000d / 5d
$q3_dir_ni = (-$q3_dir_dep) * 0.70d
$q3_res_dep = 1000000d / 5d
$q3_temp = (1000000d - $q3_res_dep) - (600000d - $q3_dir_dep)
$q3_dtl = $q3_temp * 0.30d
$q3_res_ni = (400000d - $q3_res_dep) - ((-$q3_dir_dep) * 0.30d + $q3_dtl)
$q3_comp_res = $q3_temp * 0.70d
Assert-Equal (-84000d) $q3_dir_ni "Q3 Dir NI"
Assert-Equal 320000d $q3_temp "Q3 Temp Diff"
Assert-Equal 96000d $q3_dtl "Q3 DTL"
Assert-Equal 140000d $q3_res_ni "Q3 Res NI"
Assert-Equal 224000d $q3_comp_res "Q3 Comp Res"
Assert-Equal $q3_comp_res ($q3_res_ni - $q3_dir_ni) "Q3 Reserve Diff Match"

foreach ($tok in @("800,000", "200,000", "150,000", "250,000", "240,000", "180,000", "84,000", "140,000", "224,000", "96,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1C-06 CrossCheck $tok"
}

Write-Host "[Test-L1C-06] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0