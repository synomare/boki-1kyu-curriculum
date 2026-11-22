param(
    [string]$RootDir = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = Split-Path -Parent $PSScriptRoot
}

$rulesPath = Join-Path $PSScriptRoot "lint_rules.json"
if (-not (Test-Path $rulesPath)) {
    Write-Host "[ERROR] lint_rules.json not found at $rulesPath" -ForegroundColor Red
    exit 1
}

$rulesJson = [System.IO.File]::ReadAllText($rulesPath, [System.Text.Encoding]::UTF8)
$rules = $rulesJson | ConvertFrom-Json

function Parse-DecimalCell {
    param(
        [string]$Raw,
        [string]$YenSuffix
    )
    $s = $Raw.Trim()
    if ([string]::IsNullOrWhiteSpace($s) -or $s -eq "-" -or $s -eq "---") {
        return 0d
    }
    $s = $s.Replace(",", "").Replace($YenSuffix, "").Trim()
    if ([string]::IsNullOrWhiteSpace($s)) {
        return 0d
    }
    $out = 0d
    if ([decimal]::TryParse($s, [System.Globalization.NumberStyles]::Number, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$out)) {
        return $out
    }
    return $null
}

function Split-MarkdownRow {
    param([string]$Line)
    $trimmed = $Line.Trim()
    if ($trimmed.StartsWith("|")) { $trimmed = $trimmed.Substring(1) }
    if ($trimmed.EndsWith("|")) { $trimmed = $trimmed.Substring(0, $trimmed.Length - 1) }
    $parts = $trimmed -split "\|"
    $result = @()
    foreach ($p in $parts) {
        $result += $p.Trim()
    }
    return ,$result
}

function Test-UnitFile {
    param(
        [string]$FilePath,
        $Rules,
        [bool]$CheckUnitSections = $true
    )

    $errors = New-Object System.Collections.Generic.List[string]
    $content = [System.IO.File]::ReadAllText($FilePath, [System.Text.Encoding]::UTF8)
    $lines = $content -split "\r?\n"

    if ($CheckUnitSections) {
    # 1. Check required headings order (## 0. .. ## 7.)
    $headingIndices = @{}
    $lastLineIdx = -1
    foreach ($req in $Rules.required_headings) {
        $foundIdx = -1
        for ($i = 0; $i -lt $lines.Length; $i++) {
            if ($lines[$i].TrimStart().StartsWith($req)) {
                $foundIdx = $i
                break
            }
        }
        if ($foundIdx -lt 0) {
            $errors.Add("Missing required heading: $req")
        } else {
            if ($foundIdx -le $lastLineIdx) {
                $errors.Add("Heading out of order: $req at line $($foundIdx + 1)")
            }
            $lastLineIdx = $foundIdx
            $headingIndices[$req] = $foundIdx
        }
    }

    # Helper to get section text
    $getSectionText = {
        param([string]$StartHeading, [string]$NextHeading)
        if (-not $headingIndices.ContainsKey($StartHeading)) { return "" }
        $s = $headingIndices[$StartHeading] + 1
        $e = $lines.Length - 1
        if (-not [string]::IsNullOrWhiteSpace($NextHeading) -and $headingIndices.ContainsKey($NextHeading)) {
            $e = $headingIndices[$NextHeading] - 1
        }
        if ($e -lt $s) { return "" }
        return ($lines[$s..$e] -join "`n")
    }

    if ($errors.Count -eq 0) {
        $sec0 = & $getSectionText "## 0." "## 1."
        $sec2 = & $getSectionText "## 2." "## 3."
        $sec3 = & $getSectionText "## 3." "## 4."
        $sec4 = & $getSectionText "## 4." "## 5."
        $sec5 = & $getSectionText "## 5." "## 6."
        $sec6 = & $getSectionText "## 6." "## 7."
        $sec7 = & $getSectionText "## 7." ""

        # Sec 0 checks
        foreach ($f in $Rules.sec0_required_fields) {
            if (-not $sec0.Contains($f)) {
                $errors.Add("Section 0 missing metadata field: $f")
            }
        }

        # Sec 2 checks: code block (ASCII diagram) & journal table
        if (-not $sec2.Contains('```')) {
            $errors.Add("Section 2 missing ASCII drafting format code block")
        }
        if (-not ($sec2.Contains($Rules.journal_headers.debit_amount) -and $sec2.Contains($Rules.journal_headers.credit_amount))) {
            $errors.Add("Section 2 missing standard journal table")
        }

        # Sec 3 checks
        foreach ($lbl in $Rules.sec3_required_labels) {
            if (-not $sec3.Contains($lbl)) {
                $errors.Add("Section 3 missing label: $lbl")
            }
        }

        # Sec 4 checks
        if (-not $sec4.Contains("|")) {
            $errors.Add("Section 4 missing comparison table")
        }
        foreach ($term in $Rules.sec4_required_terms) {
            if (-not $sec4.Contains($term)) {
                $errors.Add("Section 4 missing required term: $term")
            }
        }

        # Sec 5 checks: no leaks
        foreach ($leak in $Rules.sec5_forbidden_leaks) {
            if ($sec5.Contains($leak)) {
                $errors.Add("Section 5 contains forbidden answer/hint leak: $leak")
            }
        }

        # Sec 6 checks
        foreach ($req6 in $Rules.sec6_required_terms) {
            if (-not $sec6.Contains($req6)) {
                $errors.Add("Section 6 missing required item: $req6")
            }
        }

        # Sec 7 checks: at least 3 checklist items
        $checkCount = 0
        foreach ($l in ($sec7 -split "\r?\n")) {
            if ($l.TrimStart().StartsWith($Rules.checklist_prefix)) {
                $checkCount++
            }
        }
        if ($checkCount -lt 3) {
            $errors.Add("Section 7 must contain at least 3 checklist items (found $checkCount)")
        }
    }
    }

    # 2. Forbidden mnemonics & deprecated 2027 terms
    for ($i = 0; $i -lt $lines.Length; $i++) {
        $line = $lines[$i]
        foreach ($bad in $Rules.forbidden_mnemonics) {
            if ($line.Contains($bad)) {
                $errors.Add("Line $($i + 1): Forbidden mnemonic found: $bad")
            }
        }
        foreach ($dep in $Rules.deprecated_2027_terms) {
            if ($line.Contains($dep)) {
                $ctxStart = [Math]::Max(0, $i - 1)
                $ctxEnd = [Math]::Min($lines.Length - 1, $i + 1)
                $ctx = ($lines[$ctxStart..$ctxEnd] -join " ")
                $allowed = $false
                foreach ($mk in $Rules.deprecated_allow_markers) {
                    if ($ctx.Contains($mk)) { $allowed = $true; break }
                }
                if (-not $allowed) {
                    $errors.Add("Line $($i + 1): Deprecated 2027 term without transition note: $dep")
                }
            }
        }
    }

    # 3. Journal tables balance verification
    $tableCount = 0
    $groupCount = 0
    $idx = 0
    while ($idx -lt $lines.Length) {
        $line = $lines[$idx].Trim()
        if ($line.StartsWith("|") -and $line.Contains($Rules.journal_headers.debit_amount) -and $line.Contains($Rules.journal_headers.credit_amount)) {
            $headers = Split-MarkdownRow -Line $line
            $debitIdx = [Array]::IndexOf($headers, $Rules.journal_headers.debit_amount)
            $creditIdx = [Array]::IndexOf($headers, $Rules.journal_headers.credit_amount)
            $groupColIdx = -1
            foreach ($gc in $Rules.journal_headers.group_columns) {
                $pos = [Array]::IndexOf($headers, $gc)
                if ($pos -ge 0) { $groupColIdx = $pos; break }
            }

            if ($debitIdx -lt 0 -or $creditIdx -lt 0) {
                $idx++
                continue
            }

            $tableCount++
            $tableStartLine = $idx + 1
            $idx += 2 # skip header and separator

            $tableDebitSum = 0d
            $tableCreditSum = 0d
            $curDebit = 0d
            $curCredit = 0d
            $curStartLine = $idx + 1
            $hasValidNum = $false

            while ($idx -lt $lines.Length -and $lines[$idx].Trim().StartsWith("|")) {
                $cells = Split-MarkdownRow -Line $lines[$idx]
                if ($cells.Length -gt [Math]::Max($debitIdx, $creditIdx)) {
                    $isNewGroup = $false
                    if ($groupColIdx -ge 0 -and $groupColIdx -lt $cells.Length) {
                        if (-not [string]::IsNullOrWhiteSpace($cells[$groupColIdx])) {
                            $isNewGroup = $true
                        }
                    }

                    if ($isNewGroup -and ($curDebit -ne 0d -or $curCredit -ne 0d)) {
                        $groupCount++
                        if ($curDebit -ne $curCredit) {
                            $errors.Add("Journal group imbalance at line ${curStartLine}: Debit=$curDebit vs Credit=$curCredit")
                        }
                        $curDebit = 0d
                        $curCredit = 0d
                        $curStartLine = $idx + 1
                    }

                    $dVal = Parse-DecimalCell -Raw $cells[$debitIdx] -YenSuffix $Rules.yen_suffix
                    $cVal = Parse-DecimalCell -Raw $cells[$creditIdx] -YenSuffix $Rules.yen_suffix
                    if ($null -eq $dVal -or $null -eq $cVal) {
                        $errors.Add("Line $($idx + 1): Non-numeric amount in journal table")
                    } else {
                        if ($dVal -gt 0d -or $cVal -gt 0d) { $hasValidNum = $true }
                        $curDebit += $dVal
                        $curCredit += $cVal
                        $tableDebitSum += $dVal
                        $tableCreditSum += $cVal
                    }
                }
                $idx++
            }

            if ($curDebit -ne 0d -or $curCredit -ne 0d) {
                $groupCount++
                if ($curDebit -ne $curCredit) {
                    $errors.Add("Journal group imbalance at line ${curStartLine}: Debit=$curDebit vs Credit=$curCredit")
                }
            }
            if (-not $hasValidNum) {
                $errors.Add("Journal table at line $tableStartLine has no numeric entries")
            }
            if ($tableDebitSum -ne $tableCreditSum) {
                $errors.Add("Journal table total imbalance at line ${tableStartLine}: Debit=$tableDebitSum vs Credit=$tableCreditSum")
            }
        } else {
            $idx++
        }
    }

    return [PSCustomObject]@{
        File       = $FilePath
        Errors     = $errors
        Tables     = $tableCount
        Groups     = $groupCount
    }
}

$totalFiles = 0
$totalErrors = 0
$totalTables = 0
$totalGroups = 0

foreach ($folder in $Rules.unit_folders) {
    $dirPath = Join-Path $RootDir $folder
    if (-not (Test-Path $dirPath)) { continue }
    $mdFiles = Get-ChildItem -Path $dirPath -Filter "*.md" | Sort-Object Name
    foreach ($f in $mdFiles) {
        $totalFiles++
        $res = Test-UnitFile -FilePath $f.FullName -Rules $rules -CheckUnitSections $true
        $totalTables += $res.Tables
        $totalGroups += $res.Groups
        $rel = $f.FullName.Replace($RootDir, "").TrimStart("\")
        if ($res.Errors.Count -eq 0) {
            Write-Host "[PASS] $rel (Tables: $($res.Tables), Groups: $($res.Groups))" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] $rel ($($res.Errors.Count) errors)" -ForegroundColor Red
            foreach ($err in $res.Errors) {
                Write-Host "       - $err" -ForegroundColor Red
            }
            $totalErrors += $res.Errors.Count
        }
    }
}

if ($rules.extra_folders) {
    foreach ($folder in $rules.extra_folders) {
        $dirPath = Join-Path $RootDir $folder
        if (-not (Test-Path $dirPath)) { continue }
        $mdFiles = Get-ChildItem -Path $dirPath -Filter "*.md" | Sort-Object Name
        foreach ($f in $mdFiles) {
            $totalFiles++
            $res = Test-UnitFile -FilePath $f.FullName -Rules $rules -CheckUnitSections $false
            $totalTables += $res.Tables
            $totalGroups += $res.Groups
            $rel = $f.FullName.Replace($RootDir, "").TrimStart("\")
            if ($res.Errors.Count -eq 0) {
                Write-Host "[PASS] $rel (Tables: $($res.Tables), Groups: $($res.Groups))" -ForegroundColor Green
            } else {
                Write-Host "[FAIL] $rel ($($res.Errors.Count) errors)" -ForegroundColor Red
                foreach ($err in $res.Errors) {
                    Write-Host "       - $err" -ForegroundColor Red
                }
                $totalErrors += $res.Errors.Count
            }
        }
    }
}

Write-Host ""
Write-Host "=== STRUCTURE LINT SUMMARY ===" -ForegroundColor Cyan
Write-Host "Files Checked  : $totalFiles"
Write-Host "Journal Tables : $totalTables"
Write-Host "Journal Groups : $totalGroups"
Write-Host "TOTAL ERRORS   : $totalErrors"

if ($totalErrors -gt 0 -or $totalFiles -eq 0) {
    exit 1
}
exit 0
