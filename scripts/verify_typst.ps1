param(
    [string]$RootDir = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = Split-Path -Parent $PSScriptRoot
}

$errors = New-Object System.Collections.Generic.List[string]
$manifestPath = Join-Path $PSScriptRoot "curriculum_manifest.json"
$manifest = ([System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8)) | ConvertFrom-Json

function Test-ValidPdf {
    param(
        [string]$Path,
        [int]$MinBytes = 5000
    )
    if (-not (Test-Path $Path)) {
        return "Missing PDF: $Path"
    }
    $fi = Get-Item $Path
    if ($fi.Length -lt $MinBytes) {
        return "PDF too small ($($fi.Length) bytes): $Path"
    }
    $fs = [System.IO.File]::OpenRead($Path)
    try {
        $buf = New-Object byte[] 5
        $read = $fs.Read($buf, 0, 5)
        $sig = [System.Text.Encoding]::ASCII.GetString($buf, 0, $read)
        if ($sig -ne "%PDF-") {
            return "Invalid PDF signature ($sig): $Path"
        }
    } finally {
        $fs.Close()
    }
    return $null
}

# 1. Check template & main.typ
foreach ($req in @("typst\template.typ", "typst\main.typ")) {
    $p = Join-Path $RootDir $req
    if (-not (Test-Path $p)) { $errors.Add("Missing Typst source: $p") }
}

# 2. Check full book PDF
$fullPdf = Join-Path $RootDir "dist\pdf\boki-1kyu-curriculum.pdf"
$errFull = Test-ValidPdf -Path $fullPdf -MinBytes 20000
if ($errFull) { $errors.Add($errFull) }

# 3. Check each available unit PDF
$checkedUnits = 0
foreach ($item in $manifest.items) {
    $mdPath = Join-Path $RootDir ($item.path.Replace("/", "\"))
    if (Test-Path $mdPath) {
        $checkedUnits++
        $uPdf = Join-Path $RootDir ("dist\pdf\units\" + $item.id + ".pdf")
        $errU = Test-ValidPdf -Path $uPdf -MinBytes 5000
        if ($errU) { $errors.Add($errU) }
    }
}

# 4. Cross-check viewer curriculum_data.js pdfAvailable flags
$dataPath = Join-Path $RootDir "viewer\curriculum_data.js"
if (Test-Path $dataPath) {
    $rawJs = [System.IO.File]::ReadAllText($dataPath, [System.Text.Encoding]::UTF8).Trim()
    $prefix = "window.CURRICULUM_DATA = "
    $jsonPart = $rawJs.Substring($prefix.Length, $rawJs.Length - $prefix.Length - 1)
    $parsed = $jsonPart | ConvertFrom-Json
    if (-not $parsed.fullPdfAvailable) {
        $errors.Add("curriculum_data.js fullPdfAvailable is false")
    }
    foreach ($it in $parsed.items) {
        if ($it.available -and (-not $it.pdfAvailable)) {
            $errors.Add("curriculum_data.js pdfAvailable is false for $($it.id)")
        }
    }
}

if ($errors.Count -eq 0) {
    Write-Host "[PASS] Typst PDF verification passed (Full Book + $checkedUnits unit PDFs valid)." -ForegroundColor Green
    Write-Host "TOTAL ERRORS: 0"
    exit 0
} else {
    foreach ($e in $errors) {
        Write-Host "[FAIL] $e" -ForegroundColor Red
    }
    Write-Host "TOTAL ERRORS: $($errors.Count)"
    exit 1
}
