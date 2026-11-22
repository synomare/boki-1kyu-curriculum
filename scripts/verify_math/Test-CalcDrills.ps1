# Test-CalcDrills.ps1 - Pure ASCII math verification for all 36 calc_drills.json items
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$jsonPath = Join-Path (Split-Path -Parent $PSScriptRoot) "calc_drills.json"
$items = ([System.IO.File]::ReadAllText($jsonPath, [System.Text.Encoding]::UTF8)) | ConvertFrom-Json
$byId = @{}
foreach ($it in $items) { $byId[$it.id] = $it }

function Assert-Calc {
    param([string]$Id, [decimal]$ExpectedNum, [string]$ExpectedSign = "none")
    $it = $byId[$Id]
    if ($null -eq $it) { throw "Missing $Id in calc_drills.json" }
    if ([decimal]$it.answerNum -ne $ExpectedNum) {
        throw "FAIL [$Id]: expected $ExpectedNum, got $($it.answerNum)"
    }
    if ($it.varianceSign -ne $ExpectedSign) {
        throw "FAIL [$Id]: expected sign '$ExpectedSign', got '$($it.varianceSign)'"
    }
}

Assert-Calc "CALC-01" ((520d - 500d) * 400d) "unfavorable"
Assert-Calc "CALC-02" ((1200d * 250d) - 290000d) "favorable"
Assert-Calc "CALC-03" (600000d * 45d / 90d)
Assert-Calc "CALC-04" (980000d - (400d * 900d + 600000d)) "unfavorable"
Assert-Calc "CALC-05" (600d * (1000d - 900d)) "unfavorable"
Assert-Calc "CALC-06" (500000d + 40000d - 15000d)
Assert-Calc "CALC-07" (560000d * 80d / 400d)
Assert-Calc "CALC-08" (((80000d + 920000d) / (450d + 50d)) * 450d)
Assert-Calc "CALC-09" ([Math]::Round((1100000d * 200d / 650d), 0))
Assert-Calc "CALC-10" (((1300000d / 650d) * 450d) / 300d)
Assert-Calc "CALC-11" ((300d - 290d) * 1200d) "favorable"
Assert-Calc "CALC-12" (300d * (1200d - 1150d)) "unfavorable"
Assert-Calc "CALC-13" ((300d + 30d - 20d) * 2d * 1500d)
Assert-Calc "CALC-14" (2400000d / ((5000d - 3000d) / 5000d))
Assert-Calc "CALC-15" ((2400000d + 1200000d) / 0.4d)
Assert-Calc "CALC-16" (((8000000d - 6000000d) / 8000000d) * 100d)
Assert-Calc "CALC-17" (1500000d + (180000d - 120000d))
Assert-Calc "CALC-18" (4000000d / 1600000d)
Assert-Calc "CALC-19" ((500000d * 0.60d) + (6000d * 50d))
Assert-Calc "CALC-20" (270000d / 0.9d)
Assert-Calc "CALC-21" ((300000d * 0.50d) + ((200000d + 300000d * 0.20d) * 0.50d))
Assert-Calc "CALC-22" ((920000d / 460d) * (400d + 20d))
Assert-Calc "CALC-23" (700000d * 600000d / 1000000d)
Assert-Calc "CALC-24" ((550000d - 400000d) - 180000d)
Assert-Calc "CALC-25" (10000d - 5000d) "unfavorable"
Assert-Calc "CALC-26" (140d * (1000d - 950d)) "unfavorable"
Assert-Calc "CALC-27" ((1000d / 2d) * 600d)
Assert-Calc "CALC-28" ((12000d - 10000d) * 0.20d * 500d) "favorable"
Assert-Calc "CALC-29" (12000d * (0.20d - 0.18d) * 500d) "unfavorable"
Assert-Calc "CALC-30" (2750000d - (15000000d * 0.10d))
Assert-Calc "CALC-31" (400d + (700d - 400d))
Assert-Calc "CALC-32" ((200d * 500d) + (8d * 60000d))
Assert-Calc "CALC-33" ((1000d * (1500d - 900d)) - 150000d - (200d * 1000d))
Assert-Calc "CALC-34" ([decimal][Math]::Sqrt([double](2d * 10000d * 8000d / 160d)))
Assert-Calc "CALC-35" (1500000d - 150000d - (150000d * 0.30d))
Assert-Calc "CALC-36" ((600000d * 0.70d) + (400000d * 0.30d))

Write-Host "[PASS] Test-CalcDrills: All $($items.Count) calculation drills verified." -ForegroundColor Green
exit 0
