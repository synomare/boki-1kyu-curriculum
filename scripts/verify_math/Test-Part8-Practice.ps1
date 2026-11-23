[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$script:Passed = 0
$script:Failed = 0

function Assert-Eq {
    param(
        [string]$Name,
        [decimal]$Actual,
        [decimal]$Expected,
        [decimal]$Tolerance = 0d
    )
    $diff = [Math]::Abs($Actual - $Expected)
    if ($diff -le $Tolerance) {
        $script:Passed++
    } else {
        $script:Failed++
        Write-Host "[FAIL] $Name : Expected=$Expected, Actual=$Actual (Diff=$diff)" -ForegroundColor Red
    }
}

# --- PR-01: Monthly Close & POS / Credit Clearing ---
[decimal]$cashSales = 3000000d
[decimal]$cashShort = 3000d
[decimal]$cashBanked = $cashSales - $cashShort
Assert-Eq "PR-01 Cash banked" $cashBanked 2997000d

[decimal]$ccGross = 6600000d
[decimal]$ccFee = [Math]::Round($ccGross * 0.03d, 0)
[decimal]$ccNet = $ccGross - $ccFee
Assert-Eq "PR-01 CC fee" $ccFee 198000d
Assert-Eq "PR-01 CC net" $ccNet 6402000d

[decimal]$qrGross = 2400000d
[decimal]$qrFee = [Math]::Round($qrGross * 0.025d, 0)
[decimal]$qrNet = $qrGross - $qrFee
Assert-Eq "PR-01 QR fee" $qrFee 60000d
Assert-Eq "PR-01 QR net" $qrNet 2340000d

[decimal]$ccSettledGross = 6000000d
[decimal]$ccSettledNet = $ccSettledGross * (1d - 0.03d)
Assert-Eq "PR-01 CC settled net" $ccSettledNet 5820000d
[decimal]$ccEndingBal = ($ccNet + $qrNet) - $ccSettledNet - $qrNet
Assert-Eq "PR-01 Ending credit receivable" $ccEndingBal 582000d
Assert-Eq "PR-01 Total sales" ($cashSales + $ccGross + $qrGross) 12000000d
Assert-Eq "PR-01 Total bank fees" ($ccFee + $qrFee + 1100d) 259100d
Assert-Eq "PR-01 Bank net increase" ($cashBanked + $ccSettledNet + $qrNet + 150000d - 1100d) 11305900d

# --- PR-02: Inventory Cutoff/Shrinkage/NRV + 200% DB Retirement + Std Cost ---
[decimal]$invBook = 1000d * 1200d
[decimal]$invCutoff = 40d * 1200d
[decimal]$invShrink = 20d * 1200d
[decimal]$invValLoss = 940d * (1200d - 1100d)
[decimal]$invEnd = $invBook - $invCutoff - $invShrink - $invValLoss
Assert-Eq "PR-02 Inventory cutoff" $invCutoff 48000d
Assert-Eq "PR-02 Inventory shrinkage" $invShrink 24000d
Assert-Eq "PR-02 Inventory valuation loss" $invValLoss 94000d
Assert-Eq "PR-02 Ending inventory" $invEnd 1034000d

[decimal]$machCost = 2000000d
[decimal]$depY1 = $machCost * 0.40d
[decimal]$depY2 = ($machCost - $depY1) * 0.40d
[decimal]$bvY2 = $machCost - $depY1 - $depY2
[decimal]$retireLoss = $bvY2 + 50000d - 30000d
Assert-Eq "PR-02 Dep Y1" $depY1 800000d
Assert-Eq "PR-02 Dep Y2" $depY2 480000d
Assert-Eq "PR-02 BV Y2" $bvY2 720000d
Assert-Eq "PR-02 Retirement loss" $retireLoss 740000d

[decimal]$stdMat = 1000d * 2d * 500d
[decimal]$actMat = 2120d * 520d
[decimal]$priceVar = (500d - 520d) * 2120d
[decimal]$qtyVar = 500d * (2000d - 2120d)
Assert-Eq "PR-02 Price variance" $priceVar (-42400d)
Assert-Eq "PR-02 Qty variance" $qtyVar (-60000d)
Assert-Eq "PR-02 Total variance" ($priceVar + $qtyVar) ($stdMat - $actMat)

# --- PR-03: Audit Adjustments & Tax Effect ---
[decimal]$preTaxImpact = -420000d - 420000d
[decimal]$taxImpact = -126000d - 126000d
[decimal]$netImpact = $preTaxImpact - $taxImpact
Assert-Eq "PR-03 Pre-tax impact" $preTaxImpact (-840000d)
Assert-Eq "PR-03 Net impact" $netImpact (-588000d)

# --- PR-04: Company A vs Company B ROA / DuPont ROE / CCC / Safety ---
[decimal]$aSales = 10000d; [decimal]$aCogs = 7000d; [decimal]$aOp = 1000d; [decimal]$aInt = 40d
[decimal]$aNet = ($aOp - $aInt) * 0.70d
[decimal]$aAssets = 6000d; [decimal]$aEq = 3000d
[decimal]$aRoe = ($aNet / $aSales) * ($aSales / $aAssets) * ($aAssets / $aEq)
Assert-Eq "PR-04 A NetInc" $aNet 672d
Assert-Eq "PR-04 A ROE" ($aRoe * 100d) 22.40d 0.01d
[decimal]$aCcc = (1000d / $aSales * 365d) + (700d / $aCogs * 365d) - (1400d / $aCogs * 365d)
Assert-Eq "PR-04 A CCC" $aCcc 0.0d 0.01d
Assert-Eq "PR-04 A ICR" ($aOp / $aInt) 25.0d

[decimal]$bSales = 10000d; [decimal]$bCogs = 7000d; [decimal]$bOp = 1000d; [decimal]$bInt = 160d
[decimal]$bNet = ($bOp - $bInt) * 0.70d
[decimal]$bAssets = 10000d; [decimal]$bEq = 2000d
[decimal]$bRoe = ($bNet / $bSales) * ($bSales / $bAssets) * ($bAssets / $bEq)
Assert-Eq "PR-04 B NetInc" $bNet 588d
Assert-Eq "PR-04 B ROE" ($bRoe * 100d) 29.40d 0.01d
[decimal]$bCcc = (3000d / $bSales * 365d) + (2800d / $bCogs * 365d) - (700d / $bCogs * 365d)
Assert-Eq "PR-04 B CCC" $bCcc 219.0d 0.01d
Assert-Eq "PR-04 B DE" ((3800d + 3500d) / $bEq) 3.65d
Assert-Eq "PR-04 B ICR" ($bOp / $bInt) 6.25d

# --- PR-05: ASBJ 34 New Lease On-Balance Impact ---
[decimal]$leasePv = [Math]::Round(600d * 4.45182233d, 0)
[decimal]$leaseDep = [Math]::Round($leasePv / 5d, 0)
[decimal]$leaseInt = [Math]::Round($leasePv * 0.04d, 0)
[decimal]$leasePrin = 600d - $leaseInt
Assert-Eq "PR-05 Lease PV" $leasePv 2671d
Assert-Eq "PR-05 Lease Dep" $leaseDep 534d
Assert-Eq "PR-05 Lease Int" $leaseInt 107d
Assert-Eq "PR-05 Lease Prin" $leasePrin 493d
Assert-Eq "PR-05 Post-34 OpInc" (1000d + 600d - $leaseDep) 1066d
Assert-Eq "PR-05 Post-34 EBITDA" (1066d + 400d + $leaseDep) 2000d
Assert-Eq "PR-05 Post-34 PreTax" (1066d - 60d - $leaseInt) 899d
Assert-Eq "PR-05 Post-34 EqRatio" ([Math]::Round(5000d / (10000d + $leasePv) * 100d, 1)) 39.5d
Assert-Eq "PR-05 Post-34 DE" ([Math]::Round((3000d + $leasePv) / 5000d, 2)) 1.13d
Assert-Eq "PR-05 Post-34 OpROA" ([Math]::Round(1066d / (10000d + $leasePv) * 100d, 2)) 8.41d

# --- PR-06: 3-Law Triangle Reconciliation ---
[decimal]$taxableInc = 10000000d + 600000d - 400000d + 1000000d
[decimal]$currTax = $taxableInc * 0.30d
[decimal]$dtaAdd = 1000000d * 0.30d
[decimal]$plTax = $currTax - $dtaAdd
[decimal]$plNet = 10000000d - $plTax
Assert-Eq "PR-06 Taxable income" $taxableInc 11200000d
Assert-Eq "PR-06 Current tax" $currTax 3360000d
Assert-Eq "PR-06 DTA" $dtaAdd 300000d
Assert-Eq "PR-06 PL tax" $plTax 3060000d
Assert-Eq "PR-06 PL net income" $plNet 6940000d

# --- PR-07: Business Models (Negative CCC / Principal vs Agent / DOL) ---
[decimal]$retCcc = (500d / 36500d * 365d) + (1260d / 25550d * 365d) - (3150d / 25550d * 365d)
Assert-Eq "PR-07 Retail CCC" $retCcc (-22.0d) 0.01d
Assert-Eq "PR-07 Retail WC" (500d + 1260d - 3150d) (-1390d)
Assert-Eq "PR-07 DOL" (6000d / 1500d) 4.0d
Assert-Eq "PR-07 +10pct OpInc" (1500d + 6000d * 0.10d) 2100d
Assert-Eq "PR-07 -10pct OpInc" (1500d - 6000d * 0.10d) 900d

# --- PR-08: Forensic OpCF & M&A PPA ---
[decimal]$y2OpCf = 1200d + 300d - (2600d - 1000d) - (2300d - 900d) + (850d - 800d) - 360d
Assert-Eq "PR-08 Forensic Y2 OpCF" $y2OpCf (-1810d)
Assert-Eq "PR-08 Forensic Y2 DSO" ([Math]::Round(2600d / 10000d * 365d, 1)) 94.9d
Assert-Eq "PR-08 Forensic Y2 DIO" ([Math]::Round(2300d / 6125d * 365d, 1)) 137.1d

[decimal]$ppaDtl = (400d + 1000d) * 0.30d
[decimal]$ppaNetFv = 2800d + 400d + 1000d - $ppaDtl
[decimal]$ppaGoodwill = 5000d - $ppaNetFv
Assert-Eq "PR-08 PPA DTL" $ppaDtl 420d
Assert-Eq "PR-08 PPA Net FV" $ppaNetFv 3780d
Assert-Eq "PR-08 PPA Goodwill" $ppaGoodwill 1220d

Write-Host "[Test-Part8-Practice] Passed: $($script:Passed), Failed: $($script:Failed)"
if ($script:Failed -gt 0) { exit 1 }
exit 0
