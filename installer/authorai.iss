; AuthorAI — Inno Setup 6 Skript
;
; Build:  pwsh -File scripts/build-installer.ps1
; Direkt: ISCC.exe installer\authorai.iss
;
; Voraussetzung: release\authorai.exe existiert (bun run build:binary)
;
; Per-User-Installation (kein UAC), Start-Menü- und optionale Desktop-Verknüpfung,
; legt beim ersten Install eine .env aus .env.example an.
; Beim Deinstallieren wird gefragt, ob Cover + .env mit entfernt werden sollen.

#define MyAppName "AuthorAI"
#define MyAppVersion "0.2.0"
#define MyAppPublisher "KT-Society & Echo"
#define MyAppExeName "authorai.exe"

[Setup]
AppId={{A11F0AA1-3C4E-4B7C-9E2D-7B1C0E5A9D10}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
LicenseFile=..\LICENSE
OutputDir=..\release
OutputBaseFilename=AuthorAI-Setup-{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}
DisableWelcomePage=no

[Languages]
Name: "german"; MessagesFile: "compiler:Languages\German.isl"

[Tasks]
Name: "desktopicon"; Description: "Desktop-Verknüpfung anlegen"; GroupDescription: "Zusätzliche Aufgaben:"

[Files]
Source: "..\release\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release\.env.example"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release\.env.example"; DestDir: "{app}"; DestName: ".env"; Flags: onlyifdoesntexist uninsneveruninstall

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{#MyAppName} jetzt starten"; Flags: nowait postinstall skipifsilent

[Code]
function InitializeUninstall(): Boolean;
var
  RemoveData: Boolean;
begin
  Result := True;
  if DirExists(ExpandConstant('{app}\covers')) or FileExists(ExpandConstant('{app}\.env')) then
  begin
    RemoveData := MsgBox(
      'Sollen die erzeugten Cover und die .env entfernt werden?' + #13#10 +
      'Deine Bücher, Charaktere und Welten liegen im Browser und bleiben unberührt.',
      mbConfirmation, MB_YESNO) = IDYES;
    if RemoveData then
    begin
      DelTree(ExpandConstant('{app}\covers'), True, True, True);
      DeleteFile(ExpandConstant('{app}\.env'));
    end;
  end;
end;
