[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

function Assert-Eq {
    param([decimal]$Expected, [decimal]$Actual, [string]$Label)
    if ($Expected -ne $Actual) {
        throw "ASSERTION FAILED [$Label]: Expected $Expected, Actual $Actual"
    }
}

# Subject 1: Commercial Bookkeeping
$ptsSSP = 625000d * 0.80d
$allocSales = (4500000d * 4500000d) / (4500000d + $ptsSSP)
$allocCL = 4500000d - $allocSales
$redeemedRev = ($allocCL * 200000d) / $ptsSSP
Assert-Eq 4230000d ($allocSales + $redeemedRev) "L1 S1(1) total sales"
Assert-Eq 270000d ($allocCL - $redeemedRev) "L1 S1(1) end CL"

$cfPV = 2205000d / (1.05d * 1.05d)
$cfAllow = 2205000d - $cfPV
Assert-Eq 205000d $cfAllow "L1 S1(2a) CF allowance"

$bondInt = 960000d * 0.04d
$bondEnd = 960000d + ($bondInt - 20000d)
Assert-Eq 38400d $bondInt "L1 S1(2b) bond int"
Assert-Eq 978400d $bondEnd "L1 S1(2b) bond end"

$newLiab = 600000d * 3.5460d
$leaseAdj = $newLiab - 1050000d
$newROU = 1000000d + $leaseAdj
$rouDep = $newROU / 4d
$leaseInt = $newLiab * 0.05d
$endLiab = $newLiab + $leaseInt - 600000d
$endROU = $newROU - $rouDep
Assert-Eq 106380d $leaseInt "L1 S1(3) lease int"
Assert-Eq 519400d $rouDep "L1 S1(3) ROU dep"
Assert-Eq 1558200d $endROU "L1 S1(3) end ROU"
Assert-Eq 1633980d $endLiab "L1 S1(3) end Liab"

$aroInt = 500000d * 0.04d
$aroAdd = 100000d * 0.8638d
$aroEnd = 500000d + $aroInt + $aroAdd
Assert-Eq 20000d $aroInt "L1 S1(4) ARO int"
Assert-Eq 606380d $aroEnd "L1 S1(4) ARO end"

$rbExp = 300000d + (3000000d * 0.02d) - (2000000d * 0.03d) + (200000d / 10d)
$rbProv = 800000d + $rbExp - 250000d
Assert-Eq 320000d $rbExp "L1 S1(5) RB expense"
Assert-Eq 870000d $rbProv "L1 S1(5) RB provision"

$dtaEnd = (270000d + 205000d + 870000d) * 0.30d
$taxAdj = $dtaEnd - 240000d
Assert-Eq 403500d $dtaEnd "L1 S1(6) end DTA"
Assert-Eq 163500d $taxAdj "L1 S1(6) tax adj"

# Subject 2: Accounting Theory
Assert-Eq 100000d (400000d - 300000d) "L1 S2 step gain"
Assert-Eq 280000d ((400000d + 1000000d) - (1600000d * 0.70d)) "L1 S2 goodwill"
$basicEPS = 4800000d / 100000d
$soFree = (15000d * (1000d - 600d)) / 1000d
$cbAdj = 14000000d * 0.03d * 0.70d
$cbSh = 14000000d / 1000d
$dilEPS = (4800000d + $cbAdj) / (100000d + $soFree + $cbSh)
Assert-Eq 48d $basicEPS "L1 S2 basic EPS"
Assert-Eq 42.45d $dilEPS "L1 S2 diluted EPS"

# Subject 3: Industrial Bookkeeping
$priceVar = (200d - 210d) * 600d + (300d - 290d) * 450d
$mixVar = (630d - 600d) * 200d + (420d - 450d) * 300d
$yieldVar = (1000d - 1050d) * 240d
Assert-Eq (-1500d) $priceVar "L1 S3 price var"
Assert-Eq (-3000d) $mixVar "L1 S3 mix var"
Assert-Eq (-12000d) $yieldVar "L1 S3 yield var"
Assert-Eq (-15000d) ($mixVar + $yieldVar) "L1 S3 qty var sum"

$dmUnit = 900000d / (760d - 100d + 200d + 40d)
$ccUnit = 1720000d / (760d - 40d + 120d + 20d)
$netSpoil = (40d * $dmUnit + 20d * $ccUnit) - (40d * 200d)
$spoilRate = $netSpoil / (760d + 200d)
$compCost = 165000d + 660d * $dmUnit + 720d * $ccUnit + 760d * $spoilRate
$ewipCost = 200d * $dmUnit + 120d * $ccUnit + 200d * $spoilRate
Assert-Eq 75d $spoilRate "L1 S3 spoil rate"
Assert-Eq 2322000d $compCost "L1 S3 completed"
Assert-Eq 455000d $ewipCost "L1 S3 EWIP"
Assert-Eq (165000d + 900000d + 1720000d) ($compCost + $ewipCost + 8000d) "L1 S3 input=output"

# Subject 4: Cost Accounting
$lpMax = 300d * 630d + 400d * 480d
$spM = (630d * 2d - 480d) / 3d
$spL = (480d * 2d - 630d) / 3d
Assert-Eq 381000d $lpMax "L1 S4 LP max CM"
Assert-Eq 260d $spM "L1 S4 shadow machine"
Assert-Eq 110d $spL "L1 S4 shadow labor"
Assert-Eq $lpMax (1000d * $spM + 1100d * $spL) "L1 S4 LP duality"

$wacc = 0.40d * 0.05d * 0.70d + 0.60d * 0.11d
$t0 = -6000000d + 1200000d + (2000000d - 1200000d) * 0.30d
$annCF = 1800000d * 0.70d + (1500000d - 500000d) * 0.30d
$npv = $annCF * 3.3121d + $t0
Assert-Eq 0.08d $wacc "L1 S4 WACC"
Assert-Eq (-4560000d) $t0 "L1 S4 T=0 CF"
Assert-Eq 1560000d $annCF "L1 S4 annual CF"
Assert-Eq 606876d $npv "L1 S4 NPV"

Write-Host "[PASS] Test-Mock-L1: All EX-04 math assertions passed." -ForegroundColor Green
exit 0
