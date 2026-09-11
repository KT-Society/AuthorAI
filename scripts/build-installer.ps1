<#
.SYNOPSIS
  Baut einen Windows-Installer aus dem release\-Ordner — NSIS (empfohlen) oder Inno Setup.

.DESCRIPTION
  Engine-Wahl:
    -Engine auto    (Standard) NSIS wenn vorhanden, sonst Inno Setup
    -Engine nsis    NSIS (zlib-Lizenz → kommerzieller Vertrieb erlaubt)
    -Engine inno    Inno Setup 6 (nur nicht-kommerziell ohne eigene Lizenz)

  Voraussetzungen:
    * release\authorai.exe existiert  →  vorher: bun run build:binary
    * makensis.exe (NSIS) bzw. iscc.exe (Inno Setup 6)

  Ergebnis: release\AuthorAI-Setup-<version>.exe

.EXAMPLE
  pwsh -File scripts/build-installer.ps1
  pwsh -File scripts/build-installer.ps1 -Engine nsis
#>
param(
  [ValidateSet("auto", "nsis", "inno")]
  [string]$Engine = "auto"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $root "release"

function Find-Makensis {
  $command = Get-Command makensis.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\nsis64\Bin\makensis.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\NSIS\makensis.exe"),
    "${env:ProgramFiles(x86)}\NSIS\makensis.exe",
    "$env:ProgramFiles\NSIS\makensis.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

function Find-Iscc {
  $command = Get-Command iscc.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

$binary = Join-Path $releaseDir "authorai.exe"
if (-not (Test-Path $binary)) {
  Write-Host "release\authorai.exe fehlt — zuerst 'bun run build:binary' ausführen." -ForegroundColor Yellow
  exit 1
}

$makensis = Find-Makensis
$iscc = Find-Iscc

$resolvedEngine = $Engine
if ($Engine -eq "auto") {
  if ($makensis) { $resolvedEngine = "nsis" }
  elseif ($iscc) { $resolvedEngine = "inno" }
  else {
    Write-Error "Weder NSIS (makensis.exe) noch Inno Setup (iscc.exe) gefunden.`nNSIS: https://nsis.sourceforge.io/Download  ·  Inno: https://jrsoftware.org/isdl.php"
  }
}

if ($resolvedEngine -eq "nsis") {
  if (-not $makensis) {
    Write-Error "NSIS (makensis.exe) nicht gefunden.`nErwartet auch unter: $env:LOCALAPPDATA\Programs\nsis64\Bin\makensis.exe"
  }
  Write-Host "→ Kompiliere NSIS-Installer mit $makensis" -ForegroundColor Cyan
  Push-Location (Join-Path $root "installer")
  try {
    & $makensis "authorai.nsi"
    if ($LASTEXITCODE -ne 0) {
      Write-Error "NSIS ist mit Exit-Code $LASTEXITCODE abgebrochen — siehe Ausgabe oben."
    }
  } finally {
    Pop-Location
  }
} else {
  if (-not $iscc) {
    Write-Error "Inno Setup 6 (iscc.exe) nicht gefunden. Download: https://jrsoftware.org/isdl.php"
  }
  Write-Host "→ Kompiliere Inno-Setup-Installer mit $iscc" -ForegroundColor Cyan
  Write-Host "  Hinweis: Inno Setup ist nur für nicht-kommerzielle Nutzung kostenfrei." -ForegroundColor Yellow
  & $iscc (Join-Path $root "installer\authorai.iss")
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Inno Setup ist mit Exit-Code $LASTEXITCODE abgebrochen — siehe Ausgabe oben."
  }
}

$setup = Get-ChildItem $releaseDir -Filter "AuthorAI-Setup-*.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $setup) {
  Write-Error "Kein Installer in release\ gefunden — die Kompilierung war nicht erfolgreich."
}

Write-Host "✓ Installer ($resolvedEngine): $($setup.Name) ($([math]::Round($setup.Length / 1MB, 1)) MB)" -ForegroundColor Green
