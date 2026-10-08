$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectPath 'package.json') -Raw | ConvertFrom-Json
$buildPath = Join-Path $projectPath 'dist\win-unpacked'
if (-not (Test-Path -LiteralPath (Join-Path $buildPath 'fsc.exe'))) { throw 'build the app first with pnpm pack or pnpm dist' }
$installRoot = Join-Path $env:LOCALAPPDATA 'Programs\fsc'
$installPath = Join-Path $installRoot $package.version
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'fsc.lnk'
if (Test-Path -LiteralPath $installPath) { throw "installation already exists: $installPath" }
$wsh = New-Object -ComObject WScript.Shell
if (Test-Path -LiteralPath $shortcutPath) {
  $existingTarget = [IO.Path]::GetFullPath($wsh.CreateShortcut($shortcutPath).TargetPath)
  $allowedPrefix = [IO.Path]::GetFullPath($installRoot).TrimEnd('\') + '\'
  if (-not $existingTarget.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($existingTarget) -ne 'fsc.exe') {
    throw "desktop shortcut points outside this app's installation: $shortcutPath"
  }
}
New-Item -ItemType Directory -Path $installPath -Force | Out-Null
Get-ChildItem -LiteralPath $buildPath | Copy-Item -Destination $installPath -Recurse
$installedExe = Join-Path $installPath 'fsc.exe'
if ((Get-FileHash -LiteralPath $installedExe).Hash -ne (Get-FileHash -LiteralPath (Join-Path $buildPath 'fsc.exe')).Hash) { throw 'installed executable does not match the build' }
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $installedExe
$shortcut.WorkingDirectory = $installPath
$shortcut.IconLocation = "$installedExe,0"
$shortcut.Description = 'frame jpeg exports with camera metadata'
$shortcut.Save()
[pscustomobject]@{ executable = $installedExe; shortcut = $shortcutPath } | ConvertTo-Json
