param(
    [string]$RootDir = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = Split-Path -Parent $PSScriptRoot
}

$manifestPath = Join-Path $PSScriptRoot "curriculum_manifest.json"
if (-not (Test-Path $manifestPath)) {
    Write-Host "[ERROR] curriculum_manifest.json not found at $manifestPath" -ForegroundColor Red
    exit 1
}

$rulesPath = Join-Path $PSScriptRoot "lint_rules.json"
if (-not (Test-Path $rulesPath)) {
    Write-Host "[ERROR] lint_rules.json not found at $rulesPath" -ForegroundColor Red
    exit 1
}

$manifestText = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8)
$manifest = $manifestText | ConvertFrom-Json

$rulesText = [System.IO.File]::ReadAllText($rulesPath, [System.Text.Encoding]::UTF8)
$rules = $rulesText | ConvertFrom-Json

function Split-MdRow {
    param([string]$Line)
    $t = $Line.Trim()
    if ($t.StartsWith("|")) { $t = $t.Substring(1) }
    if ($t.EndsWith("|")) { $t = $t.Substring(0, $t.Length - 1) }
    $parts = $t -split "\|"
    $res = @()
    foreach ($p in $parts) { $res += $p.Trim() }
    return ,$res
}

function Find-FocusLine {
    param(
        [string]$QuestionBody,
        [string]$TargetLabel
    )
    if ([string]::IsNullOrWhiteSpace($QuestionBody) -or [string]::IsNullOrWhiteSpace($TargetLabel)) {
        return ""
    }
    $qLines = $QuestionBody -split "\r?\n"
    $lbl = $TargetLabel.Trim()

    # Pattern 1: leading digits e.g. "1", "1開始", "2支払(抜)", "1決算(利)"
    if ($lbl -match '^(\d+)') {
        $num = $matches[1]
        foreach ($ql in $qLines) {
            $t = $ql.Trim()
            if ($t -match ("^(?:[-*]\s*)?(?:\*\*)?(?:\($num\)|$num\.\s|$num\u3001|\[$num\])")) {
                return $t
            }
        }
    }
    # Pattern 2: parenthesized number e.g. "(1)", "(2)"
    if ($lbl -match '^\((\d+)\)') {
        $num = $matches[1]
        foreach ($ql in $qLines) {
            $t = $ql.Trim()
            if ($t -match ("^(?:###\s*)?(?:[-*]\s*)?(?:\*\*)?(?:\($num\)|$num\.\s)")) {
                return $t
            }
        }
    }
    # Pattern 3: date like "11/10" or "4/1" -> also check "11月10日"
    if ($lbl -match '^(\d{1,2})/(\d{1,2})') {
        $m = $matches[1]
        $d = $matches[2]
        $pat1 = [regex]::Escape("$m/$d")
        $pat2 = "$m\u6708$d\u65E5"
        foreach ($ql in $qLines) {
            $t = $ql.Trim()
            if (($t -match $pat1) -or ($t -match $pat2)) {
                return $t
            }
        }
    }
    # Pattern 4: circled numbers ①..⑩ (\u2460..\u2469)
    if ($lbl -match '^([\u2460-\u2469])') {
        $c = [regex]::Escape($matches[1])
        foreach ($ql in $qLines) {
            $t = $ql.Trim()
            if ($t -match $c) { return $t }
        }
    }
    return ""
}

function Parse-TablesInLines {
    param(
        [string[]]$Lines,
        $Rules
    )
    $dSubKey = $Rules.journal_headers.debit_subject
    $dAmtKey = $Rules.journal_headers.debit_amount
    $cSubKey = $Rules.journal_headers.credit_subject
    $cAmtKey = $Rules.journal_headers.credit_amount
    $groupCols = @($Rules.journal_headers.group_columns)

    $groups = New-Object System.Collections.Generic.List[object]
    $nonTableNotes = New-Object System.Collections.Generic.List[string]
    $inCodeBlock = $false
    $i = 0

    while ($i -lt $Lines.Length) {
        $trim = $Lines[$i].Trim()
        if ($trim.StartsWith('```')) {
            $inCodeBlock = -not $inCodeBlock
            $i++
            continue
        }
        if ($inCodeBlock) {
            $i++
            continue
        }

        if ($trim.StartsWith("|") -and ($i + 1 -lt $Lines.Length) -and ($Lines[$i + 1].Trim() -match '^\|[\s:|-]+\|')) {
            $headers = Split-MdRow -Line $trim
            $dSubIdx = [Array]::IndexOf($headers, $dSubKey)
            $dAmtIdx = [Array]::IndexOf($headers, $dAmtKey)
            $cSubIdx = [Array]::IndexOf($headers, $cSubKey)
            $cAmtIdx = [Array]::IndexOf($headers, $cAmtKey)

            $grpIdx = -1
            $grpColName = ""
            foreach ($gc in $groupCols) {
                $p = [Array]::IndexOf($headers, $gc)
                if ($p -ge 0) { $grpIdx = $p; $grpColName = $gc; break }
            }

            if ($dSubIdx -ge 0 -and $dAmtIdx -ge 0 -and $cSubIdx -ge 0 -and $cAmtIdx -ge 0 -and $grpIdx -ge 0) {
                $i += 2
                $curLabel = ""
                $curRows = New-Object System.Collections.Generic.List[object]

                while ($i -lt $Lines.Length -and $Lines[$i].Trim().StartsWith("|")) {
                    $cells = Split-MdRow -Line $Lines[$i]
                    $maxIdx = [Math]::Max([Math]::Max($dSubIdx, $dAmtIdx), [Math]::Max($cSubIdx, $cAmtIdx))
                    if ($cells.Length -gt $maxIdx) {
                        $grpVal = if ($grpIdx -lt $cells.Length) { $cells[$grpIdx].Trim() } else { "" }
                        if (-not [string]::IsNullOrWhiteSpace($grpVal)) {
                            if ($curRows.Count -gt 0) {
                                $groups.Add([ordered]@{ label = $curLabel; colName = $grpColName; rows = $curRows.ToArray() })
                            }
                            $curLabel = $grpVal
                            $curRows = New-Object System.Collections.Generic.List[object]
                        }
                        $curRows.Add([ordered]@{
                            dSub = $cells[$dSubIdx].Trim()
                            dAmt = $cells[$dAmtIdx].Trim()
                            cSub = $cells[$cSubIdx].Trim()
                            cAmt = $cells[$cAmtIdx].Trim()
                        })
                    }
                    $i++
                }
                if ($curRows.Count -gt 0) {
                    $groups.Add([ordered]@{ label = $curLabel; colName = $grpColName; rows = $curRows.ToArray() })
                }
                continue
            }
        }

        if (-not [string]::IsNullOrWhiteSpace($trim) -and $trim -ne "---" -and -not $trim.StartsWith("|")) {
            $nonTableNotes.Add($trim)
        }
        $i++
    }

    return [ordered]@{
        groups = $groups.ToArray()
        notes  = ($nonTableNotes.ToArray() -join "`n").Trim()
    }
}

function Add-PairedDrillCard {
    param(
        $GroupObj,
        $ItObj,
        [string]$SectionLabel,
        [string]$QuestionTitle,
        [string]$QuestionBody,
        [string]$Explanation,
        [int]$SeqNum,
        $OutList
    )
    $rows = $GroupObj.rows
    if ($null -eq $rows -or $rows.Count -eq 0) { return $false }
    if ([string]::IsNullOrWhiteSpace($QuestionBody)) { return $false }

    $hasNum = $false
    foreach ($r in $rows) {
        if (($r.dAmt -match '\d') -or ($r.cAmt -match '\d')) { $hasNum = $true; break }
    }
    if (-not $hasNum) { return $false }

    $lbl = if ([string]::IsNullOrWhiteSpace($GroupObj.label)) { "Item $SeqNum" } else { $GroupObj.label }
    $focus = Find-FocusLine -QuestionBody $QuestionBody -TargetLabel $lbl

    $card = [ordered]@{
        id            = ($ItObj.id + "#" + $SeqNum)
        docId         = $ItObj.id
        docTitle      = $ItObj.title
        part          = $ItObj.part
        line          = @($ItObj.line)
        section       = $SectionLabel
        questionTitle = $QuestionTitle
        questionBody  = $QuestionBody.Trim()
        targetLabel   = $lbl
        focusLine     = $focus
        explanation   = $Explanation
        prompt        = $lbl
        rows          = @($rows)
    }
    $OutList.Add($card)
    return $true
}

function Extract-DrillCards {
    param(
        $Item,
        [string]$MdContent,
        $Rules
    )
    $cards = New-Object System.Collections.Generic.List[object]
    $lines = $MdContent -split "\r?\n"
    $cardSeq = 0

    # Case A: Cheatsheet CS-02 (standalone full-sentence transaction in '取引' column)
    if ($Item.part -eq "cheat") {
        $parsed = Parse-TablesInLines -Lines $lines -Rules $Rules
        foreach ($g in $parsed.groups) {
            $qText = $g.label
            if ([string]::IsNullOrWhiteSpace($qText) -or $qText.Length -lt 6) { continue }
            $cardSeq++
            $null = Add-PairedDrillCard -GroupObj $g -ItObj $Item -SectionLabel "CS-02 頻出仕訳リファレンス" `
                -QuestionTitle "頻出重要仕訳 #$cardSeq" -QuestionBody $qText `
                -Explanation "借方合計 ＝ 貸方合計を5要素の増減から導出してください。" `
                -SeqNum $cardSeq -OutList $cards
        }
        return $cards
    }

    # Case B: Exam mocks (EX-02, EX-03, EX-04)
    if ($Item.part -eq "exam") {
        # Map ## 1..5 sections as question bodies
        $examQMap = @{}
        $sec6Idx = -1
        for ($i = 0; $i -lt $lines.Length; $i++) {
            $t = $lines[$i].Trim()
            if ($t -match '^##\s+6\.') { $sec6Idx = $i; break }
        }
        if ($sec6Idx -lt 0) { return $cards }

        $curSecKey = ""
        $curBuf = New-Object System.Collections.Generic.List[string]
        for ($i = 0; $i -lt $sec6Idx; $i++) {
            $t = $lines[$i].Trim()
            if ($t -match '^##\s+([1-5])\.\s*(.*)$') {
                if ($curSecKey -and $curBuf.Count -gt 0) {
                    $examQMap[$curSecKey] = ($curBuf -join "`n").Trim()
                }
                $curSecKey = $matches[1]
                $curBuf = New-Object System.Collections.Generic.List[string]
                $curBuf.Add($matches[2])
            } elseif ($curSecKey -and $t -ne "---") {
                $curBuf.Add($lines[$i])
            }
        }
        if ($curSecKey -and $curBuf.Count -gt 0) {
            $examQMap[$curSecKey] = ($curBuf -join "`n").Trim()
        }

        # Parse ### subsections inside ## 6.
        $curAnsTitle = ""
        $curAnsKey = ""
        $ansBuf = New-Object System.Collections.Generic.List[string]
        $ansBlocks = New-Object System.Collections.Generic.List[object]

        for ($i = $sec6Idx + 1; $i -lt $lines.Length; $i++) {
            $t = $lines[$i].Trim()
            if ($t -match '^##\s+7\.') { break }
            if ($t -match '^###\s+(.*)$') {
                if ($curAnsTitle -and $ansBuf.Count -gt 0) {
                    $ansBlocks.Add([ordered]@{ key = $curAnsKey; title = $curAnsTitle; lines = $ansBuf.ToArray() })
                }
                $curAnsTitle = $matches[1].Trim()
                $curAnsKey = ""
                if ($curAnsTitle -match '\u7B2C([1-5])\u554F') { $curAnsKey = $matches[1] }
                elseif ($curAnsTitle -match '\u5546\u696D\u7C3F\u8A18') { $curAnsKey = "1" }
                elseif ($curAnsTitle -match '\u4F1A\u8A08\u5B66') { $curAnsKey = "2" }
                elseif ($curAnsTitle -match '\u5DE5\u696D\u7C3F\u8A18') { $curAnsKey = "3" }
                elseif ($curAnsTitle -match '\u539F\u4FA1\u8A08\u7B97') { $curAnsKey = "4" }
                $ansBuf = New-Object System.Collections.Generic.List[string]
            } elseif ($curAnsTitle) {
                $ansBuf.Add($lines[$i])
            }
        }
        if ($curAnsTitle -and $ansBuf.Count -gt 0) {
            $ansBlocks.Add([ordered]@{ key = $curAnsKey; title = $curAnsTitle; lines = $ansBuf.ToArray() })
        }

        foreach ($blk in $ansBlocks) {
            $qBody = if ($blk.key -and $examQMap.ContainsKey($blk.key)) { $examQMap[$blk.key] } else { "" }
            if ([string]::IsNullOrWhiteSpace($qBody)) { continue }
            $parsed = Parse-TablesInLines -Lines $blk.lines -Rules $Rules
            foreach ($g in $parsed.groups) {
                if (Add-PairedDrillCard -GroupObj $g -ItObj $Item -SectionLabel $blk.title `
                    -QuestionTitle $blk.title -QuestionBody $qBody -Explanation $parsed.notes `
                    -SeqNum ($cardSeq + 1) -OutList $cards) {
                    $cardSeq++
                }
            }
        }
        return $cards
    }

    # Case C: Standard 7-section curriculum units (Part I..V)
    $sec5Idx = -1
    $sec6Idx = -1
    $sec7Idx = $lines.Length
    for ($i = 0; $i -lt $lines.Length; $i++) {
        $t = $lines[$i].Trim()
        if ($sec5Idx -lt 0 -and $t -match '^##\s+5\.') { $sec5Idx = $i }
        elseif ($sec5Idx -ge 0 -and $sec6Idx -lt 0 -and $t -match '^##\s+6\.') { $sec6Idx = $i }
        elseif ($sec6Idx -ge 0 -and $t -match '^##\s+7\.') { $sec7Idx = $i; break }
    }
    if ($sec5Idx -lt 0 -or $sec6Idx -lt 0) { return $cards }

    # Extract ### 問1 / 問2 / 問3 bodies from ## 5.
    $qTitleMap = @{}
    $qBodyMap = @{}
    $curQNum = ""
    $curQTitle = ""
    $curQBuf = New-Object System.Collections.Generic.List[string]

    for ($i = $sec5Idx + 1; $i -lt $sec6Idx; $i++) {
        $t = $lines[$i].Trim()
        if ($t -match '^###\s+(.*\u554F\s*([1-9]).*)$') {
            if ($curQNum -and $curQBuf.Count -gt 0) {
                $qTitleMap[$curQNum] = $curQTitle
                $qBodyMap[$curQNum] = ($curQBuf -join "`n").Trim()
            }
            $curQTitle = $matches[1].Trim()
            $curQNum = $matches[2]
            $curQBuf = New-Object System.Collections.Generic.List[string]
        } elseif ($curQNum -and $t -ne "---") {
            $curQBuf.Add($lines[$i])
        }
    }
    if ($curQNum -and $curQBuf.Count -gt 0) {
        $qTitleMap[$curQNum] = $curQTitle
        $qBodyMap[$curQNum] = ($curQBuf -join "`n").Trim()
    }

    # Extract ### 問1 / 問2 / 問3 answer tables & explanations from ## 6.
    $curANum = ""
    $curATitle = ""
    $curABuf = New-Object System.Collections.Generic.List[string]
    $aBlocks = New-Object System.Collections.Generic.List[object]

    for ($i = $sec6Idx + 1; $i -lt $sec7Idx; $i++) {
        $t = $lines[$i].Trim()
        if ($t -match '^###\s+(.*\u554F\s*([1-9]).*)$') {
            if ($curANum -and $curABuf.Count -gt 0) {
                $aBlocks.Add([ordered]@{ num = $curANum; title = $curATitle; lines = $curABuf.ToArray() })
            }
            $curATitle = $matches[1].Trim()
            $curANum = $matches[2]
            $curABuf = New-Object System.Collections.Generic.List[string]
        } elseif ($curANum) {
            $curABuf.Add($lines[$i])
        }
    }
    if ($curANum -and $curABuf.Count -gt 0) {
        $aBlocks.Add([ordered]@{ num = $curANum; title = $curATitle; lines = $curABuf.ToArray() })
    }

    foreach ($ab in $aBlocks) {
        if (-not $qBodyMap.ContainsKey($ab.num)) { continue }
        $qTitle = $qTitleMap[$ab.num]
        $qBody = $qBodyMap[$ab.num]
        $parsed = Parse-TablesInLines -Lines $ab.lines -Rules $Rules
        foreach ($g in $parsed.groups) {
            if (Add-PairedDrillCard -GroupObj $g -ItObj $Item -SectionLabel $qTitle `
                -QuestionTitle $qTitle -QuestionBody $qBody -Explanation $parsed.notes `
                -SeqNum ($cardSeq + 1) -OutList $cards) {
                $cardSeq++
            }
        }
    }

    return $cards
}

$viewerDir = Join-Path $RootDir "viewer"
if (-not (Test-Path $viewerDir)) {
    New-Item -ItemType Directory -Path $viewerDir -Force | Out-Null
}

$itemJsonList = New-Object System.Collections.Generic.List[string]
$drillJsonList = New-Object System.Collections.Generic.List[string]
$subjectSet = New-Object System.Collections.Generic.HashSet[string]
$availableCount = 0

foreach ($item in $manifest.items) {
    $relWin = $item.path.Replace("/", "\")
    $fullPath = Join-Path $RootDir $relWin
    $isAvail = Test-Path $fullPath
    $mdContent = ""
    if ($isAvail) {
        $mdContent = [System.IO.File]::ReadAllText($fullPath, [System.Text.Encoding]::UTF8)
        $availableCount++
        if ($item.part -ne "guide") {
            $extracted = Extract-DrillCards -Item $item -MdContent $mdContent -Rules $rules
            foreach ($card in $extracted) {
                foreach ($r in $card.rows) {
                    if (-not [string]::IsNullOrWhiteSpace($r.dSub)) { $null = $subjectSet.Add($r.dSub) }
                    if (-not [string]::IsNullOrWhiteSpace($r.cSub)) { $null = $subjectSet.Add($r.cSub) }
                }
                $drillJsonList.Add(($card | ConvertTo-Json -Depth 5 -Compress))
            }
        }
    }

    $unitPdfWin = Join-Path $RootDir ("dist\pdf\units\" + $item.id + ".pdf")
    $pdfAvail = Test-Path $unitPdfWin
    $pdfRel = "../dist/pdf/units/" + $item.id + ".pdf"

    $obj = [ordered]@{
        id           = $item.id
        part         = $item.part
        path         = $item.path
        title        = $item.title
        line         = @($item.line)
        formats      = @($item.formats)
        minutes      = [int]$item.minutes
        importance   = $item.importance
        is2027New    = [bool]$item.is2027New
        available    = [bool]$isAvail
        pdfAvailable = [bool]$pdfAvail
        pdfPath      = $pdfRel
        markdown     = $mdContent
    }
    $singleJson = $obj | ConvertTo-Json -Depth 6 -Compress
    $itemJsonList.Add($singleJson)
}

$generatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
$fullPdfWin = Join-Path $RootDir "dist\pdf\boki-1kyu-curriculum.pdf"
$fullPdfAvail = if (Test-Path $fullPdfWin) { "true" } else { "false" }
$partsJson = ConvertTo-Json -InputObject @($manifest.parts) -Depth 6 -Compress
$linesJson = ConvertTo-Json -InputObject @($manifest.lines) -Depth 6 -Compress
$subjectsArr = @($subjectSet | Sort-Object)
$subjectsJson = ConvertTo-Json -InputObject $subjectsArr -Depth 3 -Compress
$itemsJoined = "[" + ($itemJsonList -join ",") + "]"
$drillsJoined = "[" + ($drillJsonList -join ",") + "]"

$jsPayload = "window.CURRICULUM_DATA = {`"generatedAt`":`"$generatedAt`",`"fullPdfPath`":`"../dist/pdf/boki-1kyu-curriculum.pdf`",`"fullPdfAvailable`":$fullPdfAvail,`"parts`":$partsJson,`"lines`":$linesJson,`"subjects`":$subjectsJson,`"items`":$itemsJoined,`"drills`":$drillsJoined};"

$outPath = Join-Path $viewerDir "curriculum_data.js"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outPath, $jsPayload, $utf8NoBom)

Write-Host "[BUILD PASS] Generated $outPath" -ForegroundColor Green
Write-Host "Total Manifest Items : $($manifest.items.Count)"
Write-Host "Available Documents  : $availableCount"
Write-Host "Extracted Drill Cards: $($drillJsonList.Count)"
Write-Host "Unique Subjects      : $($subjectsArr.Count)"
exit 0
