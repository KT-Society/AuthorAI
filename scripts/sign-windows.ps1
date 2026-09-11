<#
.SYNOPSIS
  Signiert die Windows-Artefakte in release\ (Code-Signing) — optional.

.DESCRIPTION
  Ohne konfiguriertes Zertifikat wird die Signierung ÜBERSPRUNGEN (Warnung, Exit 0) —
  das ist der Normalfall, solange du kein Zertifikat hast. Windows zeigt dann beim
  Start „Unbekannter Herausgeber" (SmartScreen).

  Zertifikat konfigurieren (eines von beiden):

    * PFX-Datei:
        $env:AUTHORAI_PFX          = "C:\pfad\authorai.pfx"
        $env:AUTHORAI_PFX_PASSWORD = "…"
        pwsh -File scripts/sign-windows.ps1

    * Zertifikat im Zertifikatsspeicher (Thumbprint):
        pwsh -File scripts/sign-windows.ps1 -Thumbprint <SHA1>

  Signtool kommt aus dem Windows SDK (Signing Tools).

.PARAMETER Path
  Ordner mit den zu signierenden .exe-Dateien (Standard: release).

.EXAMPLE
  pwsh -File scripts/sign-windows.ps1 -PfxPath C:\pfx\authorai.pfx
#>
param(
  [string]$Path = "release",
  [string]$PfxPath = $env:AUTHORAI_PFX,
  [string]$PfxPassword = $env:AUTHORAI_PFX_PASSWORD,
  [string]$Thumbprint = $env:AUTHORAI_CERT_THUMBPRINT,
  [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not $PfxPath -and -not $Thumbprint) {
  Write-Warning "Kein Zertifikat konfiguriert — Signierung übersprungen (AUTHORAI_PFX oder AUTHORAI_CERT_THUMBPRINT setzen)."
  exit 0
}

function Find-SignTool {
  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $kitsRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
  if (-not (Test-Path $kitsRoot)) { return $null }
  $kits = Get-ChildItem $kitsRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
  foreach ($kit in $kits) {
    $candidate = Join-Path $kit.FullName "x64\signtool.exe"
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

$signtool = Find-SignTool
if (-not $signtool) {
  Write-Error "signtool.exe nicht gefunden. Installiere das Windows SDK (Signing Tools)."
}

$targetDir = Join-Path $root $Path
$targets = @(Get-ChildItem $targetDir -Filter *.exe -ErrorAction SilentlyContinue)
if ($targets.Count -eq 0) {
  Write-Host "Keine .exe in '$Path' gefunden — zuerst 'bun run build:binary' ausführen." -ForegroundColor Yellow
  exit 1
}

foreach ($exe in $targets) {
  Write-Host "→ Signiere $($exe.Name)" -ForegroundColor Cyan
  if ($PfxPath) {
    & $signtool sign /fd SHA256 /f $PfxPath /p $PfxPassword /tr $TimestampUrl /td SHA256 $exe.FullName
  } else {
    & $signtool sign /fd SHA256 /sha1 $Thumbprint /tr $TimestampUrl /td SHA256 $exe.FullName
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Signieren von $($exe.Name) fehlgeschlagen (signtool Exit $LASTEXITCODE)."
  }
  & $signtool verify /pa $exe.FullName
}

Write-Host "✓ Signierung abgeschlossen" -ForegroundColor Green
