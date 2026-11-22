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

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "01_level3\L3-05_allowance_for_doubtful_accounts.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# Ex
$ex_req = (600000d + 400000d) * 0.02d
$ex_pre = 15000d - 10000d
$ex_prov = $ex_req - $ex_pre
Assert-Equal 20000d $ex_req "Ex Req Allowance"
Assert-Equal 15000d $ex_prov "Ex Provision"
Assert-Equal 980000d (1000000d - $ex_req) "Ex Net AR"

# Q1
$q1_req = (700000d + 300000d) * 0.03d
$q1_pre = 12000d - 7000d
$q1_prov = $q1_req - $q1_pre
Assert-Equal 30000d $q1_req "Q1 Req"
Assert-Equal 25000d $q1_prov "Q1 Provision"
Assert-Equal 970000d (1000000d - $q1_req) "Q1 Net AR"

# Q2
$q2_bad1_loss = 30000d - 22000d
$q2_bad2_loss = 15000d
$q2_base = 800000d + 200000d + 500000d
$q2_req = $q2_base * 0.02d
$q2_op_exp = $q2_bad1_loss + $q2_bad2_loss + ((800000d + 200000d) * 0.02d)
$q2_non_op_exp = 500000d * 0.02d
Assert-Equal 8000d $q2_bad1_loss "Q2 Bad Debt 1"
Assert-Equal 30000d $q2_req "Q2 Req"
Assert-Equal 43000d $q2_op_exp "Q2 Op Bad Debt Exp"
Assert-Equal 10000d $q2_non_op_exp "Q2 Non-Op Bad Debt Exp"
Assert-Equal 53000d ($q2_op_exp + $q2_non_op_exp) "Q2 Total Bad Debt Exp"

# Q3
$q3_req = 1200000d * 0.025d
$q3_pre = $q3_req + 5000d
$q3_x = 45000d - $q3_pre
Assert-Equal 30000d $q3_req "Q3 Req"
Assert-Equal 10000d $q3_x "Q3 X"

foreach ($tok in @("980,000", "25,000", "970,000", "43,000", "53,000", "35,000", "10,000")) {
    Assert-Contains -Text $mdText -Token $tok -Label "L3-05 CrossCheck $tok"
}

Write-Host "[Test-L3-05] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
