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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "05_level1_industrial\L1I-02_advanced_process_costing_1.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_norm = (100d * 500d) + (40d * 800d)
$ex_abn = (100d * 500d) + (100d * 800d)
$ex_fin = 780000d + (($ex_norm * 3d) / 4d)
$ex_end = 228000d + (($ex_norm * 1d) / 4d)
Assert-Equal 82000d $ex_norm "Ex Norm"
Assert-Equal 130000d $ex_abn "Ex Abn"
Assert-Equal 841500d $ex_fin "Ex Fin"
Assert-Equal 248500d $ex_end "Ex End"

# Q1
$q1_fin = 600d * (400d + 300d + 500d)
$q1_e1 = (200d * 400d) + (100d * 300d)
$q1_e2 = (200d * 400d) + (200d * 300d) + (100d * 500d)
Assert-Equal 720000d $q1_fin "Q1 Fin"
Assert-Equal 110000d $q1_e1 "Q1 E1"
Assert-Equal 190000d $q1_e2 "Q1 E2"

# Q2
$q2a_fin = 300000d + 180000d + 420000d
$q2a_end = 200000d + 120000d + 140000d
$q2b_fin = 300000d + 300000d + 480000d
$q2b_end = 200000d + 80000d
Assert-Equal 900000d $q2a_fin "Q2A Fin"
Assert-Equal 460000d $q2a_end "Q2A End"
Assert-Equal 1080000d $q2b_fin "Q2B Fin"
Assert-Equal 280000d $q2b_end "Q2B End"

# Q3
$q3_net_sp = 82000d - 10000d
$q3_fin = 780000d + (($q3_net_sp * 3d) / 4d)
$q3_end = 228000d + (($q3_net_sp * 1d) / 4d)
Assert-Equal 834000d $q3_fin "Q3 Fin"
Assert-Equal 246000d $q3_end "Q3 End"

foreach ($tok in @("841,500", "248,500", "130,000", "720,000", "110,000", "190,000", "900,000", "460,000", "1,080,000", "280,000", "834,000", "246,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1I-02 CrossCheck $tok"
}

Write-Host "[Test-L1I-02] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0