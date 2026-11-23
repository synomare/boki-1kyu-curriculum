param(
    [string]$RootDir = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = Split-Path -Parent $PSScriptRoot
}

$viewerDir = Join-Path $RootDir "viewer"
$requiredFiles = @("index.html", "styles.css", "app.js", "studio_tools.js", "curriculum_data.js", "sw.js", "manifest.webmanifest", "apple-touch-icon.png", "icon.svg")
$errors = New-Object System.Collections.Generic.List[string]

foreach ($f in $requiredFiles) {
    $p = Join-Path $viewerDir $f
    if (-not (Test-Path $p)) {
        $errors.Add("Missing required viewer file: $p")
    } else {
        $len = (Get-Item $p).Length
        if ($len -eq 0) {
            $errors.Add("Empty viewer file: $p")
        }
    }
}

$manifestPath = Join-Path $PSScriptRoot "curriculum_manifest.json"
$manifest = ([System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8)) | ConvertFrom-Json
$expectedCount = $manifest.items.Count
$drillCount = 0

$dataPath = Join-Path $viewerDir "curriculum_data.js"
if (Test-Path $dataPath) {
    $rawJs = [System.IO.File]::ReadAllText($dataPath, [System.Text.Encoding]::UTF8).Trim()
    $prefix = "window.CURRICULUM_DATA = "
    if (-not $rawJs.StartsWith($prefix) -or -not $rawJs.EndsWith(";")) {
        $errors.Add("curriculum_data.js does not match expected JS wrapper format")
    } else {
        $jsonPart = $rawJs.Substring($prefix.Length, $rawJs.Length - $prefix.Length - 1)
        try {
            $parsed = $jsonPart | ConvertFrom-Json
            if ($parsed.items.Count -ne $expectedCount) {
                $errors.Add("Expected $expectedCount items in curriculum_data.js, found $($parsed.items.Count)")
            }
            $avail = @($parsed.items | Where-Object { $_.available -eq $true })
            if ($avail.Count -ne $expectedCount) {
                $errors.Add("Expected $expectedCount available items, found $($avail.Count)")
            }
            foreach ($av in $avail) {
                if ([string]::IsNullOrWhiteSpace($av.markdown)) {
                    $errors.Add("Available item $($av.id) has empty markdown")
                }
            }
            if ($null -eq $parsed.drills -or $parsed.drills.Count -lt 250) {
                $cnt = if ($null -eq $parsed.drills) { 0 } else { $parsed.drills.Count }
                $errors.Add("Expected at least 250 paired drill cards in curriculum_data.js, found $cnt")
            } else {
                $drillCount = $parsed.drills.Count
                foreach ($dc in $parsed.drills) {
                    if ([string]::IsNullOrWhiteSpace($dc.questionBody)) {
                        $errors.Add("Drill card $($dc.id) has empty questionBody")
                    }
                    if ($null -eq $dc.rows -or $dc.rows.Count -eq 0) {
                        $errors.Add("Drill card $($dc.id) has no journal rows")
                    }
                }
            }
            if ($null -eq $parsed.calcDrills -or $parsed.calcDrills.Count -lt 30) {
                $cc = if ($null -eq $parsed.calcDrills) { 0 } else { $parsed.calcDrills.Count }
                $errors.Add("Expected at least 30 calcDrills, found $cc")
            }
            if ($null -eq $parsed.theoryDrills -or $parsed.theoryDrills.Count -lt 100) {
                $tc = if ($null -eq $parsed.theoryDrills) { 0 } else { $parsed.theoryDrills.Count }
                $errors.Add("Expected at least 100 theoryDrills, found $tc")
            }
            if ($null -eq $parsed.pastExams -or $parsed.pastExams.level1Exams.Count -lt 12 -or $parsed.pastExams.level2Samples.Count -lt 5 -or $parsed.pastExams.level3Samples.Count -lt 5) {
                $errors.Add("pastExams missing required level1Exams (12), level2Samples (5), or level3Samples (5)")
            }
        } catch {
            $errors.Add("Failed to parse JSON inside curriculum_data.js: $_")
        }
    }
}

$htmlPath = Join-Path $viewerDir "index.html"
$appPath = Join-Path $viewerDir "app.js"
$toolsPath = Join-Path $viewerDir "studio_tools.js"
if ((Test-Path $htmlPath) -and (Test-Path $appPath) -and (Test-Path $toolsPath)) {
    $htmlText = [System.IO.File]::ReadAllText($htmlPath, [System.Text.Encoding]::UTF8)
    $appText = [System.IO.File]::ReadAllText($appPath, [System.Text.Encoding]::UTF8)
    $toolsText = [System.IO.File]::ReadAllText($toolsPath, [System.Text.Encoding]::UTF8)
    $combinedJs = $appText + "`n" + $toolsText

    $requiredIds = @(
        "sidebar", "mainContent", "articleBody", "tocNav", "searchInput",
        "timerPanel", "scratchPanel", "syncPanel", "syncCodeBtn", "themeToggle",
        "readerView", "drillView", "simView", "analyticsView", "cheatView"
    )
    foreach ($domId in $requiredIds) {
        if (-not $htmlText.Contains("id=`"$domId`"")) {
            $errors.Add("index.html missing id=`"$domId`"")
        }
        if (-not $combinedJs.Contains($domId)) {
            $errors.Add("app.js / studio_tools.js does not reference DOM id: $domId")
        }
    }
    $htmlOnlyIds = @("modeReaderBtn", "modeDrillBtn", "modeSimBtn", "modeAnalyticsBtn", "modeCheatBtn")
    foreach ($hid in $htmlOnlyIds) {
        if (-not $htmlText.Contains("id=`"$hid`"")) {
            $errors.Add("index.html missing id=`"$hid`"")
        }
    }
}

if ($errors.Count -eq 0) {
    Write-Host "[PASS] Viewer bundle & integrity checks passed ($expectedCount items, $drillCount drill cards verified)." -ForegroundColor Green
    Write-Host "TOTAL ERRORS: 0"
    exit 0
} else {
    foreach ($e in $errors) {
        Write-Host "[FAIL] $e" -ForegroundColor Red
    }
    Write-Host "TOTAL ERRORS: $($errors.Count)"
    exit 1
}
