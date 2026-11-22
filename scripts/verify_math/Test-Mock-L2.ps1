[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

function Assert-Eq {
    param([decimal]$Expected, [decimal]$Actual, [string]$Label)
    if ($Expected -ne $Actual) {
        throw "ASSERTION FAILED [$Label]: Expected $Expected, Actual $Actual"
    }
}

# Q1: 5 journals
$q1_pv = 750000d * 2.7232d
$q1_int = $q1_pv * 0.05d
$q1_prin = 750000d - $q1_int
$q1_dep = $q1_pv / 3d
Assert-Eq 2042400d $q1_pv "L2 Q1(1) lease PV"
Assert-Eq 102120d $q1_int "L2 Q1(1) lease interest"
Assert-Eq 647880d $q1_prin "L2 Q1(1) lease principal"
Assert-Eq 680800d $q1_dep "L2 Q1(1) ROU dep"
Assert-Eq 750000d (1000000d * 900000d / 1200000d) "L2 Q1(3) rev alloc"

# Q2: Consolidation Year 2
$sNetAcq = 1000000d + 400000d + (800000d - 600000d) * 0.70d
$gwAcq = 1432000d - ($sNetAcq * 0.80d)
$gwEnd = $gwAcq - ($gwAcq / 10d) * 2d
$nciEnd = ($sNetAcq * 0.20d) + (150000d - 50000d) * 0.20d + (200000d - 60000d) * 0.20d
$consolNI = 500000d + 200000d - (60000d * 0.80d) - ($gwAcq / 10d) + (100000d * 0.20d * 0.70d) - (150000d * 0.20d * 0.70d) + (100000d * 0.02d * 0.70d)
$nciNI = 200000d * 0.20d
$parentNI = $consolNI - $nciNI
Assert-Eq 200000d $gwAcq "L2 Q2 GW acq"
Assert-Eq 160000d $gwEnd "L2 Q2 GW end"
Assert-Eq 356000d $nciEnd "L2 Q2 NCI end"
Assert-Eq 626400d $consolNI "L2 Q2 Consol NI"
Assert-Eq 40000d $nciNI "L2 Q2 NCI NI"
Assert-Eq 586400d $parentNI "L2 Q2 Parent NI"

# Q3: TB & P/L
$tbDr = 1850000d + 1500000d + 800000d + 960000d + 1200000d + 5000000d + 1418400d + 7400000d + 2345400d + 28000d + 35080d + 200000d
$tbCr = 1100000d + 1500000d + 1418400d + 19000d + 1000000d + 400000d + 4000000d + 400000d + 879480d + 12000000d + 20000d
Assert-Eq $tbDr $tbCr "L2 Q3 TB balance"
Assert-Eq 22736880d $tbDr "L2 Q3 TB total"

$cogs = (800000d + 7400000d - 900000d) + (40d * 900d) + (960d * 50d)
$gp = 12000000d - $cogs
$rouDep = (400000d * 3.5460d) / 4d
$allowAdd = (1500000d - 50000d) * 0.02d - 19000d
$sga = 2345400d + 200000d + $rouDep + $allowAdd + 180000d + 120000d + (28000d + 2000d)
$opInc = $gp - $sga
$leaseInt = (400000d * 3.5460d) * 0.05d
$ordInc = $opInc + (20000d + 10000d) - (35080d + $leaseInt)
$taxExp = 480000d - ((180000d + 120000d) * 0.30d)
$ni = $ordInc - $taxExp
Assert-Eq 7384000d $cogs "L2 Q3 COGS"
Assert-Eq 3240000d $sga "L2 Q3 SGA"
Assert-Eq 1376000d $opInc "L2 Q3 OpInc"
Assert-Eq 1300000d $ordInc "L2 Q3 OrdInc"
Assert-Eq 910000d $ni "L2 Q3 NI"

# Q4B: Process Costing & Schlatter
$dmUnit = (180000d + 1020000d) / (900d + 300d)
$ccUnit = (150000d + 870000d) / (900d + 300d * 0.40d)
$comp = 900d * ($dmUnit + $ccUnit)
$ewip = 300d * $dmUnit + 120d * $ccUnit
Assert-Eq 1800000d $comp "L2 Q4B completed"
Assert-Eq 420000d $ewip "L2 Q4B EWIP"
$budVar = (600000d + 800d * 460d) - 1000000d
$volVar = (600000d / 500d) * (460d - 500d)
Assert-Eq (-32000d) $budVar "L2 Q4B budget var"
Assert-Eq (-48000d) $volVar "L2 Q4B volume var"

# Q5: Standard & CVP
Assert-Eq (-15600d) ((400d - 410d) * 1560d) "L2 Q5 DM price var"
Assert-Eq (-24000d) ((1500d - 1560d) * 400d) "L2 Q5 DM qty var"
Assert-Eq (-49000d) ((1000d - 1050d) * 980d) "L2 Q5 DL rate var"
Assert-Eq 20000d ((1000d - 980d) * 1000d) "L2 Q5 DL eff var"
Assert-Eq 1200d (2400000d / (5000d - 3000d)) "L2 Q5 BEP units"
Assert-Eq 800000d (1600d * 2000d - 2400000d) "L2 Q5 direct op inc"
Assert-Eq 1000000d (800000d + (200d * (1800000d / 1800d))) "L2 Q5 absorption op inc"

Write-Host "[PASS] Test-Mock-L2: All EX-03 math assertions passed." -ForegroundColor Green
exit 0
