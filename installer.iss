; Pi Metrics - Inno Setup Compiler Script
; Generates a professional Windows installer (PiMetrics-Setup-x64.exe)

#define MyAppName "Pi Metrics"
#define MyAppVersion "1.0.5"
#define MyAppPublisher "HariHaran"
#define MyAppURL "https://github.com/hariharan-uiux/pi-metrics"
#define MyAppExeName "PiMetrics.exe"

[Setup]
AppId={{E6A77699-BCB3-4A23-8FB9-BE0918C44AE5}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=LICENSE
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline dialog
OutputDir=setup_output
OutputBaseFilename=PiMetrics-v{#MyAppVersion}-Windows-x64-Setup
SetupIconFile=assets\pi-metrics.ico
UninstallDisplayIcon={app}\assets\pi-metrics.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
DisableWelcomePage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Standalone PyInstaller output (when compiled)
Source: "build_exe\PiMetrics\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\pi-metrics.ico"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\pi-metrics.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
