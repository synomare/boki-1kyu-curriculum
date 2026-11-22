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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "03_level2_industrial\L2I-06_process_costing_variations.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_p1_fin = 800d * (400d + 300d)
$ex_p2_fin = (800d * 700d) + (800d * 500d)
$ex_p2_end = (200d * 700d) + (100d * 500d)
Assert-Equal 560000d $ex_p1_fin "Ex P1 Fin"
Assert-Equal 960000d $ex_p2_fin "Ex P2 Fin"
Assert-Equal 190000d $ex_p2_end "Ex P2 End"

# Q1
$q1_p1_end = (200d * 500d) + (100d * 500d)
$q1_p1_fin = 950000d - $q1_p1_end
$q1_p2_end = (200d * 1000d) + (100d * 500d)
$q1_p2_fin = (800000d + 350000d) - $q1_p2_end
Assert-Equal 150000d $q1_p1_end "Q1 P1 End"
Assert-Equal 800000d $q1_p1_fin "Q1 P1 Fin"
Assert-Equal 250000d $q1_p2_end "Q1 P2 End"
Assert-Equal 900000d $q1_p2_fin "Q1 P2 Fin"

# Q2
$q2_oh_a = 300000d * 300d / 500d
$q2_oh_b = 300000d * 200d / 500d
$q2_a_fin = (400d * 400d) + (400d * 800d)
$q2_a_end = (100d * 400d) + (50d * 800d)
$q2_b_fin = (300d * 600d) + (300d * 800d)
$q2_b_end = (100d * 600d) + (60d * 800d)
Assert-Equal 180000d $q2_oh_a "Q2 OH A"
Assert-Equal 120000d $q2_oh_b "Q2 OH B"
Assert-Equal 480000d $q2_a_fin "Q2 A Fin"
Assert-Equal 80000d $q2_a_end "Q2 A End"
Assert-Equal 420000d $q2_b_fin "Q2 B Fin"
Assert-Equal 108000d $q2_b_end "Q2 B End"

# Q3
$q3_cor_end = (100d * 1800d) + (100d * 2700d)
$q3_err_end = (100d * 2000d) + (100d * 2000d)
Assert-Equal 450000d $q3_cor_end "Q3 Cor End"
Assert-Equal 400000d $q3_err_end "Q3 Err End"
Assert-Equal 50000d ($q3_cor_end - $q3_err_end) "Q3 Diff"

foreach ($tok in @("560,000", "960,000", "800,000", "900,000", "480,000", "420,000", "108,000", "540,000", "450,000", "50,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2I-06 CrossCheck $tok"
}

Write-Host "[Test-L2I-06] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0