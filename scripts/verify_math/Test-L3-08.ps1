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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "01_level3\L3-08_equity_and_taxes.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_div_total = 400000d + 40000d
$ex_tax_unpaid = 420000d - 150000d
$ex_vat_unpaid = 50000d - 30000d
Assert-Equal 440000d $ex_div_total "Ex Div Total"
Assert-Equal 270000d $ex_tax_unpaid "Ex Tax Unpaid"
Assert-Equal 20000d $ex_vat_unpaid "Ex VAT Unpaid"

# Q1
$q1_div_total = 300000d + 30000d + 200000d
$q1_tax_unpaid = 520000d - 180000d
$q1_vat_unpaid = 95000d - 60000d
Assert-Equal 530000d $q1_div_total "Q1 Div Total"
Assert-Equal 340000d $q1_tax_unpaid "Q1 Tax Unpaid"
Assert-Equal 35000d $q1_vat_unpaid "Q1 VAT Unpaid"

# Q2
$q2_tax_refund = 250000d - 190000d
$q2_vat_refund = 420000d - 310000d
$q2_cap_limit = 1000000d / 4d
$q2_rem_cap = $q2_cap_limit - (150000d + 80000d)
$q2_reserve = [Math]::Min(300000d * 0.1d, $q2_rem_cap)
Assert-Equal 60000d $q2_tax_refund "Q2 Tax Refund"
Assert-Equal 110000d $q2_vat_refund "Q2 VAT Refund"
Assert-Equal 20000d $q2_reserve "Q2 Legal Reserve"

# Q3
$q3_op_excl = 1000000d - 600000d
$q3_op_incl = (1100000d - 660000d) - 40000d
Assert-Equal 400000d $q3_op_excl "Q3 Op Excl VAT"
Assert-Equal $q3_op_excl $q3_op_incl "Q3 VAT Method Match"

foreach ($tok in @("440,000", "270,000", "530,000", "340,000", "35,000", "110,000", "320,000", "400,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L3-08 CrossCheck $tok"
}

Write-Host "[Test-L3-08] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
