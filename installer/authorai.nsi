; AuthorAI — NSIS Installer (NSIS 3.x, Modern UI 2)
;
; Build:  pwsh -File scripts/build-installer.ps1 -Engine nsis
; Direkt: makensis installer\authorai.nsi   (aus dem Ordner installer\ heraus)
;
; Voraussetzung: release\authorai.exe existiert (bun run build:binary)
;
; Per-User-Installation (kein UAC) in %LOCALAPPDATA%\Programs\AuthorAI,
; Start-Menü-Eintrag + optionale Desktop-Verknüpfung, legt beim ersten Install
; eine .env aus .env.example an, zeigt die Lizenz und entfernt beim Deinstallieren
; optional Cover + .env (Bücher/Charaktere liegen im Browser und bleiben erhalten).
;
; NSIS ist zlib-lizenziert → kommerzieller Vertrieb erlaubt.

Unicode true

!define APP_NAME "AuthorAI"
!define APP_VERSION "0.5.0"
!define APP_PUBLISHER "KT-Society & Echo"
!define APP_EXE "authorai.exe"

Name "${APP_NAME}"
OutFile "..\release\AuthorAI-Setup-${APP_VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
RequestExecutionLevel user
SetCompressor /SOLID lzma

VIProductVersion "0.5.0.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileDescription" "${APP_NAME} Setup"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"
VIAddVersionKey "LegalCopyright" "${APP_PUBLISHER}"

!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "${APP_NAME} jetzt starten"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\LICENSE"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "German"

; ── Haupt-Installation ─────────────────────────────────────────────────────
Section "${APP_NAME}" SecMain
  SectionIn RO

  SetOutPath "$INSTDIR"
  File "..\release\${APP_EXE}"
  File "..\release\LICENSE"
  File "..\release\README.md"
  File "..\release\.env.example"

  ; .env nur anlegen, wenn noch keine existiert (Keys bleiben erhalten)
  IfFileExists "$INSTDIR\.env" env_exists
    File "/oname=.env" "..\release\.env.example"
  env_exists:

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Deinstallieren.lnk" "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoRepair" 1
SectionEnd

; ── Optionale Desktop-Verknüpfung ──────────────────────────────────────────
Section /o "Desktop-Verknüpfung" SecDesktop
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "Installiert ${APP_NAME} (${APP_EXE}) mit Lizenz, README und .env.example."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Legt zusätzlich eine Verknüpfung auf dem Desktop an."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ── Deinstallation ─────────────────────────────────────────────────────────
Section "Uninstall"
  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\.env.example"
  Delete "$INSTDIR\Uninstall.exe"

  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Deinstallieren.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\${APP_NAME}.lnk"

  ; Generierte Cover entfernen? (Nutzerdaten liegen im Browser)
  IfFileExists "$INSTDIR\covers\*.*" 0 no_covers
    MessageBox MB_YESNO|MB_ICONQUESTION "Sollen die erzeugten Cover entfernt werden?$\r$\nDeine Bücher, Charaktere und Welten liegen im Browser und bleiben unberührt." IDNO no_covers
    RMDir /r "$INSTDIR\covers"
  no_covers:

  ; API-Keys (.env) entfernen?
  IfFileExists "$INSTDIR\.env" 0 no_env
    MessageBox MB_YESNO|MB_ICONQUESTION "Soll die .env mit deinen API-Keys entfernt werden?" IDNO no_env
    Delete "$INSTDIR\.env"
  no_env:

  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
SectionEnd
