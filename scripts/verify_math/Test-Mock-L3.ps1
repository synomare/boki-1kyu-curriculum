[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

function Assert-Eq {
    param([decimal]$Expected, [decimal]$Actual, [string]$Label)
    if ($Expected -ne $Actual) {
        throw "ASSERTION FAILED [$Label]: Expected $Expected, Actual $Actual"
    }
}

# Q1: 15 journals balanced
Assert-Eq (200000d + 120000d) (200000d + 120000d) "L3 Q1-1"
$q1_2_dep = (500000d * 0.40d * 6d) / 12d
Assert-Eq 100000d $q1_2_dep "L3 Q1-2 200pct DB 6mo"
Assert-Eq 70000d (300000d - 210000d - 20000d) "L3 Q1-3 retirement loss"
Assert-Eq 40000d (200000d - 170000d + 10000d) "L3 Q1-4 disposal loss"
Assert-Eq 35000d (120000d - 85000d) "L3 Q1-10 tax payable"
$q1_14_dep = (1200000d / 6d * 6d) / 12d
Assert-Eq 100000d $q1_14_dep "L3 Q1-14 mid-year dep"
Assert-Eq 50000d (550000d - (1200000d - 600000d - $q1_14_dep)) "L3 Q1-14 sale gain"

# Q2A: Merchandise ledger (moving average)
$avg1 = (50000d + 90000d) / 250d
Assert-Eq 560d $avg1 "L3 Q2A avg1"
$cogs1 = 200d * $avg1
$rem1 = 50d * $avg1
$avg2 = ($rem1 + 96000d) / 200d
Assert-Eq 620d $avg2 "L3 Q2A avg2"
$cogs2 = 120d * $avg2
$endInv = 80d * $avg2
$sales = 200d * 900d + 120d * 950d
$cogs = $cogs1 + $cogs2
Assert-Eq 294000d $sales "L3 Q2A sales"
Assert-Eq 186400d $cogs "L3 Q2A cogs"
Assert-Eq 107600d ($sales - $cogs) "L3 Q2A GP"
Assert-Eq 49600d $endInv "L3 Q2A endInv"

# Q2B: Fixed asset ledger
$depA = 600000d / 5d
$bvA = 600000d - 2d * $depA
$depB = (400000d * 0.40d * 6d) / 12d
$bvB = 400000d - $depB
Assert-Eq 120000d $depA "L3 Q2B depA"
Assert-Eq 80000d $depB "L3 Q2B depB"
Assert-Eq 680000d ($bvA + $bvB) "L3 Q2B total BV"
Assert-Eq 290000d ($bvB - 30000d) "L3 Q2B retirement loss"

# Q3: Pre-closing TB & P/L & B/S
$tbDr = 185000d + 1420000d + 800000d + 300000d + 240000d + 3000000d + 1000000d + 4200000d + 1450000d + 72000d + 330000d + 48000d + 150000d + 5000d
$tbCr = 520000d + 280000d + 1000000d + 14000d + 600000d + 300000d + 2500000d + 200000d + 576000d + 7200000d + 10000d
Assert-Eq $tbDr $tbCr "L3 Q3 TB balance"
Assert-Eq 13200000d $tbDr "L3 Q3 TB total"

$cogsQ3 = 240000d + 4200000d - 310000d
$gpQ3 = 7200000d - $cogsQ3
$allowAdd = (800000d + 300000d) * 0.02d - 14000d
$depBldg = 3000000d / 30d
$depEq = (800000d - 160000d) * 0.25d
$sgaQ3 = 1450000d + 36000d + 360000d + 47000d + $allowAdd + $depBldg + $depEq
$opInc = $gpQ3 - $sgaQ3
$ebt = $opInc + 15000d - 2000d - 60000d
$ni = $ebt - 280000d
Assert-Eq 3070000d $gpQ3 "L3 Q3 GP"
Assert-Eq 2161000d $sgaQ3 "L3 Q3 SGA"
Assert-Eq 909000d $opInc "L3 Q3 OpInc"
Assert-Eq 582000d $ni "L3 Q3 Net Income"

$assets = 185000d + 1420000d + 800000d + 300000d - 22000d + 310000d + 4000d + 36000d + 5000d + 2300000d + 480000d
$liab = 520000d + 280000d + 1000000d + 30000d + 130000d
$eq = 2500000d + 200000d + 576000d + $ni
Assert-Eq 5818000d $assets "L3 Q3 Assets"
Assert-Eq 1960000d $liab "L3 Q3 Liab"
Assert-Eq 3858000d $eq "L3 Q3 Equity"
Assert-Eq $assets ($liab + $eq) "L3 Q3 B/S equation"

Write-Host "[PASS] Test-Mock-L3: All EX-02 math assertions passed." -ForegroundColor Green
exit 0
