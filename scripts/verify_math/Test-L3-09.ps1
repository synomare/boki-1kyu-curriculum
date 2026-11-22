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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "01_level3\L3-09_books_vouchers_and_error_correction.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex FIFO
$ex_in = (100d * 100d) + (200d * 130d) + (50d * 160d)
$ex_fifo_cogs = (100d * 100d) + (100d * 130d) + (50d * 130d)
$ex_fifo_end = (50d * 130d) + (50d * 160d)
Assert-Equal 44000d $ex_in "Ex Input"
Assert-Equal 29500d $ex_fifo_cogs "Ex FIFO COGS"
Assert-Equal 14500d $ex_fifo_end "Ex FIFO End"
Assert-Equal $ex_in ($ex_fifo_cogs + $ex_fifo_end) "Ex FIFO Box"

# Q1
$q1_in = (40d * 500d) + (60d * 600d) + (50d * 680d)
$q1_sales = (50d + 60d) * 900d
$q1_fifo_cogs = (40d * 500d + 10d * 600d) + (50d * 600d + 10d * 680d)
$q1_fifo_end = 40d * 680d
$q1_fifo_gp = $q1_sales - $q1_fifo_cogs
Assert-Equal 90000d $q1_in "Q1 Input"
Assert-Equal 62800d $q1_fifo_cogs "Q1 FIFO COGS"
Assert-Equal 27200d $q1_fifo_end "Q1 FIFO End"
Assert-Equal 36200d $q1_fifo_gp "Q1 FIFO GP"
Assert-Equal $q1_in ($q1_fifo_cogs + $q1_fifo_end) "Q1 FIFO Box"

$q1_ma_u1 = (20000d + 36000d) / 100d
$q1_ma_c1 = 50d * $q1_ma_u1
$q1_ma_u2 = ((50d * $q1_ma_u1) + 34000d) / 100d
$q1_ma_c2 = 60d * $q1_ma_u2
$q1_ma_cogs = $q1_ma_c1 + $q1_ma_c2
$q1_ma_end = 40d * $q1_ma_u2
$q1_ma_gp = $q1_sales - $q1_ma_cogs
Assert-Equal 560d $q1_ma_u1 "Q1 MA Unit1"
Assert-Equal 620d $q1_ma_u2 "Q1 MA Unit2"
Assert-Equal 65200d $q1_ma_cogs "Q1 MA COGS"
Assert-Equal 24800d $q1_ma_end "Q1 MA End"
Assert-Equal 33800d $q1_ma_gp "Q1 MA GP"
Assert-Equal $q1_in ($q1_ma_cogs + $q1_ma_end) "Q1 MA Box"

# Q2
$q2_in = (20d * 1000d) + ((80d - 5d) * 1000d)
$q2_cogs = (60d - 5d) * 1000d
$q2_end = 40d * 1000d
Assert-Equal 95000d $q2_in "Q2 Input"
Assert-Equal 55000d $q2_cogs "Q2 COGS"
Assert-Equal 40000d $q2_end "Q2 End"

# Q3
$q3_op_adj = 180000d
Assert-Equal 180000d $q3_op_adj "Q3 OP Adj"

foreach ($tok in @("29,500", "62,800", "27,200", "36,200", "65,200", "24,800", "33,800", "55,000", "180,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L3-09 CrossCheck $tok"
}

Write-Host "[Test-L3-09] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
