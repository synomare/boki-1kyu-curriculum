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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "03_level2_industrial\L2I-07_standard_costing_basics.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_mat_p = (500d - 520d) * 4100d
$ex_mat_q = 500d * (4000d - 4100d)
$ex_lab_r = (1200d - 1180d) * 1950d
$ex_lab_t = 1200d * (1900d - 1950d)
$ex_oh_b = (1000000d + (300d * 1950d)) - 1620000d
$ex_oh_ve = 300d * (1900d - 1950d)
$ex_oh_fe = 500d * (1900d - 1950d)
$ex_oh_v = 500d * (1950d - 2000d)
Assert-Equal (-82000d) $ex_mat_p "Ex Mat P"
Assert-Equal (-50000d) $ex_mat_q "Ex Mat Q"
Assert-Equal 39000d $ex_lab_r "Ex Lab R"
Assert-Equal (-60000d) $ex_lab_t "Ex Lab T"
Assert-Equal (-35000d) $ex_oh_b "Ex OH Bud"
Assert-Equal (-15000d) $ex_oh_ve "Ex OH VE"
Assert-Equal (-25000d) $ex_oh_fe "Ex OH FE"
Assert-Equal (-25000d) $ex_oh_v "Ex OH Vol"

# Q1
$q1_beg = (50d * 1200d) + (20d * 5000d)
$q1_end = (100d * 1200d) + (60d * 5000d)
$q1_fin = 500d * 6200d
$q1_mp = (400d - 390d) * 1700d
$q1_mq = 400d * (1650d - 1700d)
$q1_lr = (1500d - 1540d) * 1050d
$q1_lt = 1500d * (1080d - 1050d)
$q1_oh = 1080000d - 1100000d
Assert-Equal 160000d $q1_beg "Q1 Beg"
Assert-Equal 420000d $q1_end "Q1 End"
Assert-Equal 3100000d $q1_fin "Q1 Fin"
Assert-Equal 17000d $q1_mp "Q1 Mat P"
Assert-Equal (-20000d) $q1_mq "Q1 Mat Q"
Assert-Equal (-42000d) $q1_lr "Q1 Lab R"
Assert-Equal 45000d $q1_lt "Q1 Lab T"
Assert-Equal (-20000d) $q1_oh "Q1 OH"

# Q2
$q2_allow = 900000d + (400d * 1450d)
$q2_b = $q2_allow - 1520000d
$q2_ve = 400d * (1400d - 1450d)
$q2_fe = 600d * (1400d - 1450d)
$q2_v = 600d * (1450d - 1500d)
Assert-Equal (-40000d) $q2_b "Q2 Bud"
Assert-Equal (-20000d) $q2_ve "Q2 VE"
Assert-Equal (-30000d) $q2_fe "Q2 FE"
Assert-Equal (-30000d) $q2_v "Q2 Vol"

# Q3
$q3_aq = 2000d - ((-60000d) / 600d)
$q3_ap = 600d - (63000d / $q3_aq)
$q3_act = $q3_aq * $q3_ap
Assert-Equal 2100d $q3_aq "Q3 Aq"
Assert-Equal 570d $q3_ap "Q3 Ap"
Assert-Equal 1197000d $q3_act "Q3 Act"

foreach ($tok in @("5,400,000", "3,100,000", "420,000", "17,000", "45,000", "1,480,000", "2,100kg", "1,197,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2I-07 CrossCheck $tok"
}

Write-Host "[Test-L2I-07] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0