# Test-L1-Comprehensive.ps1 - Pure ASCII math verification for EX-08
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

function Assert-Eq {
    param([decimal]$Actual, [decimal]$Expected, [string]$Label)
    if ($Actual -ne $Expected) {
        throw "FAIL [$Label]: expected $Expected, got $Actual"
    }
}

# Stage 1: Consolidation
$landDiffAfterTax = 200000d * 0.70d
$sEquityFair = 2000000d + 1000000d + $landDiffAfterTax
$goodwill0 = 2800000d - ($sEquityFair * 0.80d)
$nci0 = $sEquityFair * 0.20d
$gwAmort = $goodwill0 / 10d
$gwEnd = $goodwill0 - $gwAmort
$unrealizedAfterTax = 50000d * 0.70d
$nciUnrealized = $unrealizedAfterTax * 0.20d
$nciNetIncome = (500000d * 0.20d) - $nciUnrealized
$nciEnd = $nci0 + (500000d * 0.20d) - (100000d * 0.20d) - $nciUnrealized

Assert-Eq $goodwill0 288000d "Goodwill initial"
Assert-Eq $gwEnd 259200d "Goodwill ending"
Assert-Eq $nci0 628000d "NCI initial"
Assert-Eq $nciNetIncome 93000d "NCI net income"
Assert-Eq $nciEnd 701000d "NCI ending"

# Stage 2: Consolidated CF subtotal
$opCfSub = 2000000d + 400000d + 28800d - 20000d + 35000d - 150000d + 80000d + 90000d
Assert-Eq $opCfSub 2463800d "Consolidated OpCF subtotal"

# Stage 3: Non-cumulative process costing
$matUnit = 1000000d / (360d + 60d + 80d)
$p1Unit = 690000d / (360d + 60d + 40d)
$p2Unit = 760000d / (360d + 20d)
$fgCost = 360d * ($matUnit + $p1Unit + $p2Unit)
$wip2Cost = (60d * $matUnit) + (60d * $p1Unit) + (20d * $p2Unit)
$wip1Cost = (80d * $matUnit) + (40d * $p1Unit)
Assert-Eq $fgCost 1980000d "Non-cum finished goods"
Assert-Eq $wip2Cost 250000d "Non-cum WIP2"
Assert-Eq $wip1Cost 220000d "Non-cum WIP1"
Assert-Eq ($fgCost + $wip2Cost + $wip1Cost) (1000000d + 690000d + 760000d) "Non-cum input=output"

# Stage 4: Replacement NPV
$cf0 = -1500000d + 150000d + ((300000d - 150000d) * 0.30d)
$annualCf = (600000d * 0.70d) + ((500000d - 100000d) * 0.30d)
$npv = ($annualCf * 2.487d) + $cf0
Assert-Eq $cf0 (-1305000d) "Replacement CF0"
Assert-Eq $annualCf 540000d "Replacement annual CF"
Assert-Eq $npv 37980d "Replacement NPV"

Write-Host "[PASS] Test-L1-Comprehensive: All EX-08 math assertions passed." -ForegroundColor Green
exit 0
