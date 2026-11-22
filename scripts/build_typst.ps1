param(
    [string]$RootDir = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = Split-Path -Parent $PSScriptRoot
}

function Resolve-TypstExe {
    $cmd = Get-Command "typst" -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }

    $wingetLink = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\typst.exe"
    if (Test-Path $wingetLink) { return $wingetLink }

    $pkgRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
    if (Test-Path $pkgRoot) {
        $found = Get-ChildItem -Path $pkgRoot -Filter "typst.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    throw "typst.exe not found. Please install Typst via winget."
}

$typstExe = Resolve-TypstExe
$manifestPath = Join-Path $PSScriptRoot "curriculum_manifest.json"
$configPath = Join-Path $PSScriptRoot "typst_config.json"

$manifest = ([System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8)) | ConvertFrom-Json
$cfg = ([System.IO.File]::ReadAllText($configPath, [System.Text.Encoding]::UTF8)) | ConvertFrom-Json

$typstDir = Join-Path $RootDir "typst"
$genDir = Join-Path $typstDir "generated"
$distPdfDir = Join-Path $RootDir "dist\pdf"
$distUnitsDir = Join-Path $distPdfDir "units"

foreach ($d in @($typstDir, $genDir, $distPdfDir, $distUnitsDir)) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Escape-TypstStringLiteral {
    param([string]$Text)
    return $Text.Replace("\", "\\").Replace('"', '\"').Replace("`r`n", "`n").Replace("`n", "\n")
}

function Escape-TypstChars {
    param([string]$Text)
    $s = $Text.Replace("\", "\\")
    foreach ($ch in @("#", "$", "@", "<", ">", "*", "_", "[", "]", "~")) {
        $s = $s.Replace($ch, "\" + $ch)
    }
    return $s
}

function Convert-InlineToTypst {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return "" }

    $tokens = New-Object System.Collections.Generic.List[string]
    $s = [regex]::Replace($Text, '<br\s*/?>', {
        param($m)
        $idx = $tokens.Count
        $tokens.Add('#linebreak()')
        return "XTYPTAG${idx}X"
    })

    # 1. Protect inline code `...`
    $s = [regex]::Replace($s, '`([^`]+)`', {
        param($m)
        $idx = $tokens.Count
        $rawLit = Escape-TypstStringLiteral -Text $m.Groups[1].Value
        $tokens.Add('#raw("' + $rawLit + '")')
        return "XTYPTAG${idx}X"
    })

    # 2. Protect markdown links [label](href)
    $s = [regex]::Replace($s, '\[([^\]]+)\]\(([^)]+)\)', {
        param($m)
        $idx = $tokens.Count
        $lbl = Escape-TypstChars -Text $m.Groups[1].Value
        $href = $m.Groups[2].Value.Trim()
        if ($href.StartsWith("http://") -or $href.StartsWith("https://")) {
            $hrefEsc = Escape-TypstStringLiteral -Text $href
            $tokens.Add('#link("' + $hrefEsc + '")[' + $lbl + ']')
        } else {
            $tokens.Add('#strong[' + $lbl + ']')
        }
        return "XTYPTAG${idx}X"
    })

    # 3. Protect **bold**
    $s = [regex]::Replace($s, '\*\*([^*]+)\*\*', {
        param($m)
        $idx = $tokens.Count
        $inner = Escape-TypstChars -Text $m.Groups[1].Value
        $tokens.Add('#strong[' + $inner + ']')
        return "XTYPTAG${idx}X"
    })

    # 4. Protect *italic*
    $s = [regex]::Replace($s, '\*([^*]+)\*', {
        param($m)
        $idx = $tokens.Count
        $inner = Escape-TypstChars -Text $m.Groups[1].Value
        $tokens.Add('#emph[' + $inner + ']')
        return "XTYPTAG${idx}X"
    })

    # 5. Escape remaining plain text
    $s = Escape-TypstChars -Text $s

    # 6. Restore tokens in reverse order so nested tags resolve completely
    for ($i = $tokens.Count - 1; $i -ge 0; $i--) {
        $s = $s.Replace("XTYPTAG${i}X", $tokens[$i])
    }
    return $s
}

function Convert-LatexMathToTypst {
    param([string]$Latex)
    $m = $Latex.Trim()
    $m = [regex]::Replace($m, '\\text\{([^}]*)\}', '"$1"')
    $m = [regex]::Replace($m, '\\underbrace\{([^}]*)\}_\{([^}]*)\}', 'underbrace($1, $2)')
    $m = [regex]::Replace($m, '\\frac\{([^}]*)\}\{([^}]*)\}', '($1)/($2)')
    $m = $m.Replace('\times', 'times').Replace('\div', 'div').Replace('\cdot', 'dot')
    $m = $m.Replace('\le', '<=').Replace('\ge', '>=').Replace('\neq', '!=')
    $m = $m.Replace('\rightarrow', '->').Replace('\Rightarrow', '=>')
    return $m
}

function Split-MdTableRow {
    param([string]$Line)
    $t = $Line.Trim()
    if ($t.StartsWith("|")) { $t = $t.Substring(1) }
    if ($t.EndsWith("|")) { $t = $t.Substring(0, $t.Length - 1) }
    $parts = $t -split "\|"
    $res = @()
    foreach ($p in $parts) { $res += $p.Trim() }
    return ,$res
}

function Convert-MarkdownToTypst {
    param(
        [string]$MdText,
        [bool]$IsUnitDoc,
        $Config
    )

    $blocks = New-Object System.Collections.Generic.List[string]
    $src = $MdText -replace "`r`n", "`n"

    # Protect fenced code blocks
    $src = [regex]::Replace($src, '```([a-zA-Z0-9_-]*)\n([\s\S]*?)```', {
        param($m)
        $lang = $m.Groups[1].Value.Trim().ToLower()
        $body = $m.Groups[2].Value.TrimEnd("`n")
        $idx = $blocks.Count
        if ($lang -eq "mermaid") {
            $blocks.Add('#curriculum-flow-diagram()')
        } else {
            $lit = Escape-TypstStringLiteral -Text $body
            $blocks.Add('#ascii-box(raw("' + $lit + '"))')
        }
        return "`n__TYPBLOCK_${idx}__`n"
    })

    # Protect block math $$...$$
    $src = [regex]::Replace($src, '\$\$([\s\S]*?)\$\$', {
        param($m)
        $idx = $blocks.Count
        $typMath = Convert-LatexMathToTypst -Latex $m.Groups[1].Value
        $blocks.Add("`$ $typMath `$")
        return "`n__TYPBLOCK_${idx}__`n"
    })

    $lines = $src -split "`n"
    $out = New-Object System.Collections.Generic.List[string]
    $i = 0

    while ($i -lt $lines.Length) {
        $line = $lines[$i]
        $trimmed = $line.Trim()

        if ([string]::IsNullOrWhiteSpace($trimmed)) {
            $out.Add("")
            $i++
            continue
        }

        if ($trimmed -match '^__TYPBLOCK_(\d+)__$') {
            $bIdx = [int]$matches[1]
            $out.Add($blocks[$bIdx])
            $out.Add("")
            $i++
            continue
        }

        # Headings
        if ($trimmed -match '^(#{1,4})\s+(.*)$') {
            $lvl = $matches[1].Length
            $hBody = $matches[2].Trim()
            if ($IsUnitDoc) {
                foreach ($pbHead in $Config.pagebreak_before_headings) {
                    if ($trimmed.StartsWith($pbHead)) {
                        $out.Add("#pagebreak(weak: true)")
                        break
                    }
                }
            }
            $eqPrefix = "=" * $lvl
            $typH = Convert-InlineToTypst -Text $hBody
            $out.Add("$eqPrefix $typH")
            $out.Add("")
            $i++
            continue
        }

        # HR
        if ($trimmed -match '^---+$') {
            $out.Add('#line(length: 100%, stroke: 0.45pt + luma(205))')
            $out.Add("")
            $i++
            continue
        }

        # Table
        if ($trimmed.StartsWith("|") -and ($i + 1 -lt $lines.Length) -and ($lines[$i + 1].Trim() -match '^\|[\s:|-]+\|')) {
            $headers = Split-MdTableRow -Line $trimmed
            $alignCells = Split-MdTableRow -Line $lines[$i + 1]
            $alignList = @()
            foreach ($ac in $alignCells) {
                if ($ac.StartsWith(":") -and $ac.EndsWith(":")) { $alignList += "center" }
                elseif ($ac.EndsWith(":")) { $alignList += "right" }
                else { $alignList += "left" }
            }

            $isJournal = $false
            $hasD = $false; $hasC = $false
            foreach ($h in $headers) {
                if ($h -eq $Config.journal_headers[0]) { $hasD = $true }
                if ($h -eq $Config.journal_headers[1]) { $hasC = $true }
            }
            if ($hasD -and $hasC) { $isJournal = $true }

            # Column widths
            $colWidths = @()
            if ($isJournal) {
                for ($c = 0; $c -lt $headers.Length; $c++) {
                    if ($alignList[$c] -eq "right") { $colWidths += "auto" }
                    elseif ($c -eq 0 -and $headers.Length -eq 5) { $colWidths += "auto" }
                    else { $colWidths += "1fr" }
                }
            } elseif ($headers.Length -eq 7) {
                $colWidths = @("auto", "1.5fr", "1.4fr", "1.2fr", "auto", "auto", "auto")
            } elseif ($headers.Length -eq 2) {
                $colWidths = @("auto", "1fr")
            } else {
                for ($c = 0; $c -lt $headers.Length; $c++) {
                    if ($c -lt $alignList.Length -and $alignList[$c] -eq "right") { $colWidths += "auto" }
                    else { $colWidths += "1fr" }
                }
            }

            $allCells = New-Object System.Collections.Generic.List[string]
            foreach ($h in $headers) {
                $allCells.Add("[" + (Convert-InlineToTypst -Text $h) + "]")
            }

            $i += 2
            while ($i -lt $lines.Length -and $lines[$i].Trim().StartsWith("|")) {
                $rowCells = Split-MdTableRow -Line $lines[$i]
                for ($c = 0; $c -lt $headers.Length; $c++) {
                    $val = if ($c -lt $rowCells.Length) { $rowCells[$c] } else { "" }
                    $allCells.Add("[" + (Convert-InlineToTypst -Text $val) + "]")
                }
                $i++
            }

            $colsExpr = "(" + ($colWidths -join ", ") + ")"
            $alignExpr = "(" + ($alignList -join ", ") + ")"
            $isJExpr = if ($isJournal) { "true" } else { "false" }
            $cellsJoined = $allCells -join ", "
            $out.Add("#styled-table(columns: $colsExpr, aligns: $alignExpr, is-journal: $isJExpr, $cellsJoined)")
            $out.Add("")
            continue
        }

        # Blockquote
        if ($trimmed.StartsWith(">")) {
            $qLines = New-Object System.Collections.Generic.List[string]
            while ($i -lt $lines.Length -and $lines[$i].Trim().StartsWith(">")) {
                $qLines.Add(($lines[$i].Trim() -replace '^>\s?', ''))
                $i++
            }
            $rawBlock = $qLines -join "`n"
            $kind = "note"
            foreach ($tm in $Config.trap_markers) {
                if ($rawBlock.Contains($tm)) { $kind = "trap"; break }
            }
            if ($kind -eq "note") {
                foreach ($em in $Config.example_markers) {
                    if ($rawBlock.Contains($em)) { $kind = "example"; break }
                }
            }
            $convertedQ = ($qLines | ForEach-Object { Convert-InlineToTypst -Text $_ }) -join " \ `n"
            $out.Add("#callout-box(kind: `"$kind`")[`n$convertedQ`n]")
            $out.Add("")
            continue
        }

        # Checklist item
        if ($trimmed -match '^-\s+\[[ xX]\]\s+(.*)$') {
            $chkBody = Convert-InlineToTypst -Text $matches[1]
            $out.Add("#check-item[$chkBody]")
            $i++
            continue
        }

        # Unordered list
        if ($trimmed -match '^-\s+(.*)$') {
            $liBody = Convert-InlineToTypst -Text $matches[1]
            $out.Add("- $liBody")
            $i++
            continue
        }

        # Ordered list
        if ($trimmed -match '^\d+\.\s+(.*)$') {
            $olBody = Convert-InlineToTypst -Text $matches[1]
            $out.Add("+ $olBody")
            $i++
            continue
        }

        # Plain paragraph line
        $out.Add((Convert-InlineToTypst -Text $trimmed))
        $i++
    }

    return ($out -join "`n")
}

$generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm")
$compiledCount = 0
$bookIncludes = New-Object System.Collections.Generic.List[string]

foreach ($item in $manifest.items) {
    $relWin = $item.path.Replace("/", "\")
    $fullMdPath = Join-Path $RootDir $relWin
    if (-not (Test-Path $fullMdPath)) { continue }

    $mdText = [System.IO.File]::ReadAllText($fullMdPath, [System.Text.Encoding]::UTF8)
    $isUnit = ($item.part -ne "guide")
    $bodyTyp = '#import "../template.typ": *' + "`n`n" + (Convert-MarkdownToTypst -MdText $mdText -IsUnitDoc $isUnit -Config $cfg)

    $contentTypPath = Join-Path $genDir "$($item.id).typ"
    [System.IO.File]::WriteAllText($contentTypPath, $bodyTyp, $utf8NoBom)

    # Unit standalone entry
    $titleEsc = Escape-TypstStringLiteral -Text ($item.id + ": " + $item.title)
    $subEsc = Escape-TypstStringLiteral -Text $cfg.book_subtitle
    $unitEntry = @"
#import "../template.typ": *
#show: book-doc.with(
  title: "$titleEsc",
  subtitle: "$subEsc",
  generated-at: "$generatedAt",
  is-full-book: false,
)
#include "$($item.id).typ"
"@
    $unitEntryPath = Join-Path $genDir "unit_$($item.id).typ"
    [System.IO.File]::WriteAllText($unitEntryPath, $unitEntry, $utf8NoBom)

    $unitPdfPath = Join-Path $distUnitsDir "$($item.id).pdf"
    Write-Host "Compiling PDF: $($item.id).pdf ..." -ForegroundColor Cyan
    & $typstExe compile --root $RootDir $unitEntryPath $unitPdfPath
    if ($LASTEXITCODE -ne 0) {
        throw "Typst compile failed for $($item.id)"
    }
    $compiledCount++
    $bookIncludes.Add("#pagebreak(weak: true)`n#include `"generated/$($item.id).typ`"")
}

# Full combined book
$bookTitleEsc = Escape-TypstStringLiteral -Text $cfg.book_title
$bookSubEsc = Escape-TypstStringLiteral -Text $cfg.book_subtitle
$includesJoined = $bookIncludes -join "`n"
$mainTypContent = @"
#import "template.typ": *
#show: book-doc.with(
  title: "$bookTitleEsc",
  subtitle: "$bookSubEsc",
  generated-at: "$generatedAt",
  is-full-book: true,
)
$includesJoined
"@

$mainTypPath = Join-Path $typstDir "main.typ"
[System.IO.File]::WriteAllText($mainTypPath, $mainTypContent, $utf8NoBom)

$fullPdfPath = Join-Path $distPdfDir "boki-1kyu-curriculum.pdf"
Write-Host "Compiling Full Book PDF: boki-1kyu-curriculum.pdf ..." -ForegroundColor Cyan
& $typstExe compile --root $RootDir $mainTypPath $fullPdfPath
if ($LASTEXITCODE -ne 0) {
    throw "Typst compile failed for main.typ"
}
$compiledCount++

Write-Host ""
Write-Host "[TYPST BUILD PASS] Compiled $compiledCount PDF files successfully." -ForegroundColor Green
exit 0
