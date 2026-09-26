$ErrorActionPreference = 'Stop'
$proj = 'C:\Users\OUATTARA CLEMENT\Documents\Qoder\2026-09-25\dca6feae\jarvis'

# 1. Detecter Edge ou Chrome
$candidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { $browser = 'msedge' }
[Environment]::SetEnvironmentVariable('ISAAC_BROWSER', $browser, 'User')
Write-Output "BROWSER=$browser"

# 2. Raccourcis Demarrage + Bureau
$ws = New-Object -ComObject WScript.Shell
foreach ($folder in @('Startup', 'Desktop')) {
  $dir = [Environment]::GetFolderPath($folder)
  $lnk = $ws.CreateShortcut((Join-Path $dir 'Isaac IA Juniors.lnk'))
  $lnk.TargetPath = 'wscript.exe'
  $lnk.Arguments = "`"$proj\isaac-launch.vbs`""
  $lnk.WorkingDirectory = $proj
  $lnk.Description = 'Isaac IA Juniors - assistant vocal de Isaac'
  $lnk.IconLocation = 'shell32.dll,137'
  $lnk.Save()
  Write-Output "LNK_OK=$dir"
}
