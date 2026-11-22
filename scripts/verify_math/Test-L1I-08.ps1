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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "05_level1_industrial\L1I-08_strategic_cost_management.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_a = (1000d * 500d) + (2d * 60000d)
$ex_b = (200d * 500d) + (8d * 60000d)
Assert-Equal 620000d $ex_a "Ex A"
Assert-Equal 580000d $ex_b "Ex B"

# Q1
$q1_x = (600d * 500d) + (5d * 20000d) + (4d * 10000d)
$q1_y = (200d * 500d) + (10d * 20000d) + (16d * 10000d)
Assert-Equal 440000d $q1_x "Q1 X"
Assert-Equal 460000d $q1_y "Q1 Y"
Assert-Equal 880d ($q1_x / 500d) "Q1 X/u"
Assert-Equal 4600d ($q1_y / 100d) "Q1 Y/u"

# Q2
$q2_new = 220000d + 150000d + 200000d + 250000d
$q2_red = 1000000d - $q2_new
Assert-Equal 820000d $q2_new "Q2 New"
Assert-Equal 180000d $q2_red "Q2 Red"

# Q3
$q3_lcc = 50000000d * 0.80d
$q3_mfg = $q3_lcc - 4000000d - 6000000d
$q3_red_u = 3400d - ($q3_mfg / 10000d)
Assert-Equal 40000000d $q3_lcc "Q3 LCC"
Assert-Equal 30000000d $q3_mfg "Q3 Mfg"
Assert-Equal 400d $q3_red_u "Q3 Red/u"

foreach ($tok in @("620,000", "580,000", "2,900", "440,000", "460,000", "4,600", "820,000", "180,000", "40,000,000", "30,000,000", "4,000,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L1I-08 CrossCheck $tok"
}

Write-Host "[Test-L1I-08] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0