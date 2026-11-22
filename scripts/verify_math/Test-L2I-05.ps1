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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "03_level2_industrial\L2I-05_process_costing_basics.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_avg_end = (400d * 600d) + (200d * 850d)
$ex_avg_fin = (800d * 600d) + (800d * 850d)
$ex_fifo_end = (400d * 612d) + (200d * 860d)
$ex_fifo_fin = 1570000d - $ex_fifo_end
Assert-Equal 410000d $ex_avg_end "Ex Avg End"
Assert-Equal 1160000d $ex_avg_fin "Ex Avg Fin"
Assert-Equal 416800d $ex_fifo_end "Ex FIFO End"
Assert-Equal 1153200d $ex_fifo_fin "Ex FIFO Fin"

# Q1
$q1_avg_end = (500d * 500d) + (200d * 750d)
$q1_avg_fin = (1000d * 500d) + (1000d * 750d)
$q1_fifo_end = (500d * 520d) + (200d * 750d)
$q1_fifo_fin = 1650000d - $q1_fifo_end
Assert-Equal 400000d $q1_avg_end "Q1 Avg End"
Assert-Equal 1250000d $q1_avg_fin "Q1 Avg Fin"
Assert-Equal 410000d $q1_fifo_end "Q1 FIFO End"
Assert-Equal 1240000d $q1_fifo_fin "Q1 FIFO Fin"

# Q2
$q2a_end = (300d * 600d) + (180d * 800d)
$q2a_fin = 1420000d - $q2a_end
$q2b_end = (300d * 540d) + (180d * 720d)
$q2b_fin = 1420000d - $q2b_end
Assert-Equal 324000d $q2a_end "Q2A End"
Assert-Equal 1096000d $q2a_fin "Q2A Fin"
Assert-Equal 291600d $q2b_end "Q2B End"
Assert-Equal 1128400d $q2b_fin "Q2B Fin"

# Q3
$q3_err_end = 125000d + (150d * 800d)
$q3_cor_end = 125000d + (50d * 900d)
$q3_diff = $q3_err_end - $q3_cor_end
Assert-Equal 245000d $q3_err_end "Q3 Err End"
Assert-Equal 170000d $q3_cor_end "Q3 Cor End"
Assert-Equal 75000d $q3_diff "Q3 Diff"

foreach ($tok in @("1,160,000", "416,800", "1,153,200", "1,250,000", "1,240,000", "324,000", "1,096,000", "291,600", "1,128,400", "245,000", "170,000", "75,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L2I-05 CrossCheck $tok"
}

Write-Host "[Test-L2I-05] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0