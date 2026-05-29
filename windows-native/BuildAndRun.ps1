param(
    [string]$ProjectPath = "GarfieldNative.csproj",
    [switch]$SkipRun,
    [switch]$Detach,
    [int]$RemoteDebuggingPort = 0
)

$ErrorActionPreference = "Stop"

$devMode = (Get-ItemProperty `
    -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" `
    -Name AllowDevelopmentWithoutDevLicense `
    -ErrorAction SilentlyContinue).AllowDevelopmentWithoutDevLicense -eq 1

if (-not $devMode) {
    throw "Developer Mode is disabled. Enable it before building packaged WinUI apps."
}

$project = Resolve-Path $ProjectPath
$projectDirectory = Split-Path $project -Parent
$platform = if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -eq [System.Runtime.InteropServices.Architecture]::Arm64) { "ARM64" } else { "x64" }

dotnet restore $project
dotnet build $project -c Debug -p:Platform=$platform

if ($SkipRun) {
    return
}

$targetFramework = Select-Xml -Path $project -XPath "/Project/PropertyGroup/TargetFramework" |
    Select-Object -ExpandProperty Node |
    Select-Object -ExpandProperty InnerText -First 1
$runtimeIdentifier = "win-$($platform.ToLowerInvariant())"
$outputDirectory = Join-Path $projectDirectory "bin\$platform\Debug\$targetFramework\$runtimeIdentifier"

if (-not (Test-Path (Join-Path $outputDirectory "AppxManifest.xml"))) {
    throw "Could not find AppxManifest.xml in $outputDirectory. Build may not have produced a packaged output."
}

$winappArgs = @($outputDirectory)
if ($RemoteDebuggingPort -gt 0) {
    $winappArgs += @("--args", "--garfield-native-remote-debugging-port=$RemoteDebuggingPort")
}

if ($Detach) {
    winapp run @winappArgs --detach
    return
}

winapp run @winappArgs --debug-output