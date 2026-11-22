# Test-Mock-L2-Set2.ps1 - Pure ASCII math verification for EX-07
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

function Assert-Eq {
    param([decimal]$Actual, [decimal]$Expected, [string]$Label)
    if ($Actual -ne $Expected) {
        throw "FAIL [$Label]: expected $Expected, got $Actual"
    }
}

# Q1
Assert-Eq ((1000000d - 960000d) / 4d) 10000d "Q1-3 amortized cost"
Assert-Eq (5000d * (144d - 140d)) 20000d "Q1-4 FX forward"

# Q2 Net Assets
$divAmt = 600000d
$capQuarter = 4000000d / 4d
$resCurrent = 600000d + 300000d
$reqReserve = [Math]::Min($divAmt * 0.10d, $capQuarter - $resCurrent)
Assert-Eq $reqReserve 60000d "Q2 legal reserve"
Assert-Eq (4000000d + 500000d) 4500000d "Q2 ending capital"
Assert-Eq (600000d + 500000d) 1100000d "Q2 ending cap reserve"
Assert-Eq (300000d + $reqReserve) 360000d "Q2 ending earned reserve"
Assert-Eq (1500000d - 600000d - $reqReserve + 850000d) 1690000d "Q2 ending retained earnings"

# Q3 B/S
Assert-Eq (1200000d - (1200000d * 0.02d)) 1176000d "Q3 AR net"
Assert-Eq (3000000d - 1000000d - (3000000d / 30d)) 1900000d "Q3 Building net"
Assert-Eq (1000000d - (1000000d / 5d)) 800000d "Q3 ROU asset net"
Assert-Eq ((900000d - 800000d) * 0.70d) 70000d "Q3 OCI valuation"
Assert-Eq ((900000d - 800000d) * 0.30d) 30000d "Q3 DTL"

# Q4 Industrial
$j101 = 400000d + 320000d + (1500d * 80d)
$j102 = 250000d + 480000d + (1500d * 120d)
$var = 300000d - 325000d
Assert-Eq $j101 840000d "Q4 #101"
Assert-Eq $j102 910000d "Q4 #102"
Assert-Eq $var (-25000d) "Q4 OH variance"

# Q5 CVP
$cmRatio = (2000d - 1200d) / 2000d
$bepUnits = 3200000d / 800d
$bepSales = 3200000d / $cmRatio
$msr = (10000000d - $bepSales) / 10000000d
Assert-Eq $cmRatio 0.40d "Q5 CM ratio"
Assert-Eq $bepUnits 4000d "Q5 BEP units"
Assert-Eq $bepSales 8000000d "Q5 BEP sales"
Assert-Eq $msr 0.20d "Q5 MSR"

Write-Host "[PASS] Test-Mock-L2-Set2: All EX-07 math assertions passed." -ForegroundColor Green
exit 0
