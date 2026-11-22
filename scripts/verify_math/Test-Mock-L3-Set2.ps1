# Test-Mock-L3-Set2.ps1 - Pure ASCII math verification for EX-06
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

function Assert-Eq {
    param([decimal]$Actual, [decimal]$Expected, [string]$Label)
    if ($Actual -ne $Expected) {
        throw "FAIL [$Label]: expected $Expected, got $Actual"
    }
}

# Q1 calculations
Assert-Eq (200000d * 0.04d) 8000d "Q1-3 e-payment fee"
Assert-Eq (600000d * 0.50d * 6d / 12d) 150000d "Q1-4 200% DB 6m"
Assert-Eq (1000000d - 720000d - 50000d) 230000d "Q1-5 retirement loss"
Assert-Eq (400000d - 310000d + 20000d) 110000d "Q1-6 disposal loss"
Assert-Eq (25000d - (900000d * 0.02d)) 7000d "Q1-8 allowance reversal"
Assert-Eq (1200000d * 0.02d * 6d / 12d) 12000d "Q1-13 accrued interest"
Assert-Eq (350000d - 140000d) 210000d "Q1-15 tax payable"

# Q2 calculations
$apEnd = 300000d + 800000d - 50000d - 400000d - 450000d
Assert-Eq $apEnd 200000d "Q2-A AP ending balance"
$dep9m = (900000d / 5d) * 9d / 12d
$bvSell = 900000d - 360000d - $dep9m
$gainSell = 420000d - $bvSell
Assert-Eq $dep9m 135000d "Q2-B dep 9m"
Assert-Eq $bvSell 405000d "Q2-B book value"
Assert-Eq $gainSell 15000d "Q2-B gain on sale"

# Q3 Trial Balance & Financial Statements
$tbDr = 120000d + 1880000d + 1000000d + 300000d + 4000000d + 1000000d + 5000000d + 1800000d + 96000d + 440000d + 64000d + 200000d
$tbCr = 600000d + 400000d + 1500000d + 15000d + 800000d + 360000d + 3000000d + 250000d + 575000d + 8400000d
Assert-Eq $tbDr 15900000d "Q3 TB Debit"
Assert-Eq $tbCr 15900000d "Q3 TB Credit"

$cogs = 300000d + 5000000d - 380000d
$allowAdd = (1000000d * 0.02d) - 15000d
$depBldg = 4000000d / 40d
$depEquip = (1000000d - 360000d) * 0.25d
$insExp = 96000d - 48000d
$rentExp = 440000d + 40000d
$taxMisc = 64000d - 14000d
$netIncome = 8400000d - ($cogs + 1800000d + $insExp + $rentExp + $taxMisc + $allowAdd + $depBldg + $depEquip + 320000d)

Assert-Eq $cogs 4920000d "Q3 COGS"
Assert-Eq $allowAdd 5000d "Q3 Allowance"
Assert-Eq ($depBldg + $depEquip) 260000d "Q3 Depreciation"
Assert-Eq $netIncome 517000d "Q3 Net Income"

$bsLeft = 120000d + 1880000d + 1000000d + 380000d + 14000d + 48000d + 4000000d + 1000000d
$bsRight = 600000d + 400000d + 1500000d + 40000d + 120000d + 20000d + 900000d + 520000d + 3000000d + 250000d + 575000d + $netIncome
Assert-Eq $bsLeft $bsRight "Q3 B/S Balance"

Write-Host "[PASS] Test-Mock-L3-Set2: All EX-06 math assertions passed." -ForegroundColor Green
exit 0
