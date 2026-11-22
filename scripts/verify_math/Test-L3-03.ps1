[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$script:Passed = 0
$script:Failed = 0

function Assert-Equal {
    param(
        [decimal]$Expected,
        [decimal]$Actual,
        [string]$Label
    )
    if ($Expected -eq $Actual) {
        $script:Passed++
    } else {
        $script:Failed++
        Write-Host "  [FAIL] $Label : Expected=$Expected, Actual=$Actual" -ForegroundColor Red
    }
}

function Assert-Contains {
    param(
        [string]$Text,
        [string]$Token,
        [string]$Label
    )
    if ($Text.Contains($Token)) {
        $script:Passed++
    } else {
        $script:Failed++
        Write-Host "  [FAIL] $Label : Missing token '$Token' in markdown" -ForegroundColor Red
    }
}

$unitPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "01_level3\L3-03_merchandise_accounting.md"
$mdText = [System.IO.File]::ReadAllText($unitPath, [System.Text.Encoding]::UTF8)

# =========================================================
# 1. Section 2 Parallel Example (Sanpo vs Cost-of-Sales Method)
# =========================================================
$ex_beg = 100d * 1000d
$ex_pur = (200d * 950d) + 10000d
$ex_end = 60d * 1000d
$ex_cogs = $ex_beg + $ex_pur - $ex_end
$ex_sales = 240d * 1500d
$ex_gp = $ex_sales - $ex_cogs
$ex_ship = 5000d
$ex_op = $ex_gp - $ex_ship

Assert-Equal 300000d ($ex_beg + $ex_pur) "Ex Box Debit"
Assert-Equal 300000d ($ex_cogs + $ex_end) "Ex Box Credit"
Assert-Equal 240000d $ex_cogs "Ex COGS"
Assert-Equal 120000d $ex_gp "Ex Gross Profit"
Assert-Equal 115000d $ex_op "Ex Operating Profit"

# =========================================================
# 2. Drill Q1
# =========================================================
$q1_beg = 50d * 2000d
$q1_pur1 = (100d * 1900d) + 10000d
$q1_pur2 = 150d * 2000d
$q1_ret = 10d * 2000d
$q1_net_pur = $q1_pur1 + $q1_pur2 - $q1_ret
$q1_end = 80d * 2000d
$q1_cogs = $q1_beg + $q1_net_pur - $q1_end
$q1_sales = 210d * 3000d
$q1_fee = $q1_sales * 0.02d
$q1_cr_ar = $q1_sales - $q1_fee
$q1_ship = 4000d
$q1_gp = $q1_sales - $q1_cogs
$q1_op = $q1_gp - $q1_fee - $q1_ship

Assert-Equal 580000d ($q1_beg + $q1_net_pur) "Q1 Box Debit"
Assert-Equal 580000d ($q1_cogs + $q1_end) "Q1 Box Credit"
Assert-Equal 420000d $q1_cogs "Q1 COGS"
Assert-Equal 210000d $q1_gp "Q1 Gross Profit"
Assert-Equal 12600d $q1_fee "Q1 Credit Fee"
Assert-Equal 617400d $q1_cr_ar "Q1 Credit AR"
Assert-Equal 193400d $q1_op "Q1 Operating Profit"

# =========================================================
# 3. Drill Q2
# =========================================================
$q2_beg = 40d * 1500d
$q2_pur = 120d * 1500d
$q2_ap = $q2_pur - 3000d
$q2_sales_gross = 100d * 2500d
$q2_ar_initial = $q2_sales_gross + 4000d
$q2_cogs_initial = 100d * 1500d
$q2_allowance = 10d * 300d
$q2_ret_sales = 8d * 2500d
$q2_ret_cost = 8d * 1500d

$q2_net_sales = $q2_sales_gross - $q2_allowance - $q2_ret_sales
$q2_net_cogs = $q2_cogs_initial - $q2_ret_cost
$q2_end = $q2_beg + $q2_pur - $q2_net_cogs
$q2_gp = $q2_net_sales - $q2_net_cogs
$q2_ar_end = $q2_ar_initial - $q2_allowance - $q2_ret_sales

Assert-Equal 240000d ($q2_beg + $q2_pur) "Q2 Box Debit"
Assert-Equal 240000d ($q2_net_cogs + $q2_end) "Q2 Box Credit"
Assert-Equal 102000d $q2_end "Q2 Ending Inventory"
Assert-Equal 227000d $q2_net_sales "Q2 Net Sales"
Assert-Equal 138000d $q2_net_cogs "Q2 Net COGS"
Assert-Equal 89000d $q2_gp "Q2 Gross Profit"
Assert-Equal 231000d $q2_ar_end "Q2 Ending AR"
Assert-Equal 177000d $q2_ap "Q2 Ending AP"

# =========================================================
# 4. Drill Q3 (2-year Error Correction & Self-Correction)
# =========================================================
# Period 1
$q3_p1_sales = 1200000d
$q3_p1_beg = 120000d
$q3_p1_pur_corr = 880000d + 20000d
$q3_p1_end_corr = 150000d
$q3_p1_cogs_corr = $q3_p1_beg + $q3_p1_pur_corr - $q3_p1_end_corr
$q3_p1_gp_corr = $q3_p1_sales - $q3_p1_cogs_corr
$q3_p1_op_corr = $q3_p1_gp_corr

$q3_p1_pur_err = 880000d
$q3_p1_end_err = 200000d
$q3_p1_cogs_err = $q3_p1_beg + $q3_p1_pur_err - $q3_p1_end_err
$q3_p1_gp_err = $q3_p1_sales - $q3_p1_cogs_err
$q3_p1_op_err = $q3_p1_gp_err - 20000d

Assert-Equal 870000d $q3_p1_cogs_corr "Q3 P1 COGS Correct"
Assert-Equal 800000d $q3_p1_cogs_err "Q3 P1 COGS Error"
Assert-Equal (-70000d) ($q3_p1_cogs_err - $q3_p1_cogs_corr) "Q3 P1 COGS Diff"
Assert-Equal 330000d $q3_p1_gp_corr "Q3 P1 GP Correct"
Assert-Equal 400000d $q3_p1_gp_err "Q3 P1 GP Error"
Assert-Equal 330000d $q3_p1_op_corr "Q3 P1 OP Correct"
Assert-Equal 380000d $q3_p1_op_err "Q3 P1 OP Error"
Assert-Equal 50000d ($q3_p1_op_err - $q3_p1_op_corr) "Q3 P1 OP Diff"

# Period 2
$q3_p2_sales = 1300000d
$q3_p2_pur = 900000d
$q3_p2_end = 180000d

$q3_p2_cogs_corr = $q3_p1_end_corr + $q3_p2_pur - $q3_p2_end
$q3_p2_op_corr = $q3_p2_sales - $q3_p2_cogs_corr

$q3_p2_cogs_err = $q3_p1_end_err + $q3_p2_pur - $q3_p2_end
$q3_p2_op_err = $q3_p2_sales - $q3_p2_cogs_err

Assert-Equal 870000d $q3_p2_cogs_corr "Q3 P2 COGS Correct"
Assert-Equal 920000d $q3_p2_cogs_err "Q3 P2 COGS Error"
Assert-Equal 430000d $q3_p2_op_corr "Q3 P2 OP Correct"
Assert-Equal 380000d $q3_p2_op_err "Q3 P2 OP Error"
Assert-Equal (-50000d) ($q3_p2_op_err - $q3_p2_op_corr) "Q3 P2 OP Diff"

# 2-Year Total Operating Profit
$q3_tot_corr = $q3_p1_op_corr + $q3_p2_op_corr
$q3_tot_err = $q3_p1_op_err + $q3_p2_op_err
Assert-Equal 760000d $q3_tot_corr "Q3 2Y Total OP Correct"
Assert-Equal 760000d $q3_tot_err "Q3 2Y Total OP Error"
Assert-Equal 0d ($q3_tot_err - $q3_tot_corr) "Q3 2Y Total Diff Zero"

# =========================================================
# 5. Cross-check key figures inside L3-03 Markdown text
# =========================================================
$expectedTokens = @(
    "60,000", "240,000", "115,000",
    "617,400", "12,600", "420,000", "193,400",
    "102,000", "227,000", "138,000", "89,000", "231,000", "177,000",
    "870,000", "800,000", "920,000", "430,000", "760,000"
)
foreach ($tok in $expectedTokens) {
    Assert-Contains -Text $mdText -Token $tok -Label "Markdown CrossCheck $tok"
}

Write-Host "[Test-L3-03] Passed: $script:Passed, Failed: $script:Failed"
if ($script:Failed -gt 0) { exit 1 }
exit 0
