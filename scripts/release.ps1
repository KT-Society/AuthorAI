<#
.SYNOPSIS
  Ein-Befehl-Release: Checks → Standalone-Binary → (Sign) → (Installer) → (Sign).

.DESCRIPTION
  Erzeugt den versandfertigen Ordner release\ mit authorai.exe (+ Beigaben) und
  optional einem Installer.

  Signierung:
    * Ist ein Zertifikat konfiguriert, wird automatisch signiert.
    * -Sign  erzwingt die Signierung (Hinweis, wenn kein Zertifikat da ist).
    * -NoSign überspringt sie auch mit Zertifikat.
    * -RequireSignature bricht ab, wenn kein Zertifikat konfiguriert ist (CI).

.EXAMPLE
  pwsh -File scripts/release.ps1
  pwsh -File scripts/release.ps1 -Installer
  pwsh -File scripts/release.ps1 -Installer -Engine nsis
  pwsh -File scripts/release.ps1 -RequireSignature -Installer
#>
param(
  [switch]$Sign,
  [switch]$NoSign,
  [switch]$RequireSignature,
  [switch]$Installer,
  [ValidateSet("auto", "nsis", "inno")]
  [string]$Engine = "auto",
  [switch]$SkipChecks,
  [string]$PfxPath = $env:AUTHORAI_PFX,
  [string]$Thumbprint = $env:AUTHORAI_CERT_THUMBPRINT
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$signScript = Join-Path $PSScriptRoot "sign-windows.ps1"

$hasCertificate = [bool]($PfxPath -or $Thumbprint)
$doSign = (-not $NoSign) -and ($hasCertificate -or $Sign)

if ($RequireSignature -and -not $hasCertificate) {
  Write-Error "Signatur erforderlich, aber kein Zertifikat konfiguriert (AUTHORAI_PFX oder AUTHORAI_CERT_THUMBPRINT)."
}
if ($Sign -and -not $hasCertificate -and (Test-Path $signScript)) {
  Write-Host "· Kein Zertifikat konfiguriert — es wird nicht signiert." -ForegroundColor DarkGray
}

Push-Location $root
try {
  if (-not $SkipChecks) {
    Write-Host "→ Checks" -ForegroundColor Cyan
    bun run check
  }

  Write-Host "→ Standalone-Binary" -ForegroundColor Cyan
  bun run build:binary

  if ($doSign) {
    Write-Host "→ Signiere Binary" -ForegroundColor Cyan
    & $signScript -PfxPath $PfxPath -Thumbprint $Thumbprint
  }

  if ($Installer) {
    Write-Host "→ Installer bauen ($Engine)" -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "build-installer.ps1") -Engine $Engine
  }

  if ($doSign) {
    Write-Host "→ Signiere Installer (falls vorhanden)" -ForegroundColor Cyan
    & $signScript -PfxPath $PfxPath -Thumbprint $Thumbprint
  }

  Write-Host ""
  Write-Host "✓ Release fertig: release\" -ForegroundColor Green
  Get-ChildItem (Join-Path $root "release") -ErrorAction SilentlyContinue |
    Select-Object Name, @{ n = "MB"; e = { [math]::Round($_.Length / 1MB, 1) } } |
    Format-Table -AutoSize

  if (-not $doSign) {
    Write-Host "· Nicht signiert — Windows zeigt 'Unbekannter Herausgeber' (Details: docs\release.md)." -ForegroundColor DarkGray
  }
} finally {
  Pop-Location
}
