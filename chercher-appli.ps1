param([string]$Nom, [switch]$SansLancer)
# Cherche et lance n'importe quel logiciel installe sur le PC de Isaac.
$ErrorActionPreference = 'SilentlyContinue'

function Clean([string]$s) {
  $n = $s.ToLower().Normalize('FormD')
  $n = (($n -replace '[\u0300-\u036f]', '') -replace '[^a-z0-9 +]', '')
  return $n.Trim()
}

function ScoreOf([string]$base, [string]$q) {
  if ($base -eq '' -or $q -eq '') { return 0 }
  if ($base -eq $q) { return 100 }
  if ($base.StartsWith($q + ' ')) { return 95 }
  if ($q.StartsWith($base + ' ')) { return 85 }
  if ($base.StartsWith($q)) { return 80 }
  if ($base.Contains(' ' + $q + ' ') -or $base.EndsWith(' ' + $q)) { return 70 }
  if ($base.Contains($q) -and $q.Length -ge 5) { return 60 }
  if ($q.Contains($base) -and $base.Length -ge 5) { return 45 }
  return 0
}

$q = Clean $Nom
if ($q -eq '') { Write-Output 'NOTFOUND'; exit }
$cand = @()

# 1) Toutes les applications connues de Windows (menu Demarrer + applications Win32 installees)
$w = New-Object -ComObject Shell.Application
$af = $w.NameSpace('shell:AppsFolder')
foreach ($it in $af.Items()) {
  $s = ScoreOf (Clean $it.Name) $q
  if ($s -gt 0) { $cand += [PSCustomObject]@{ Score = $s; Nom = $it.Name; Aumid = $it.Path; Exe = '' } }
}

# 2) Raccourcis du menu Demarrer (cible reelle)
$shell = New-Object -ComObject WScript.Shell
foreach ($d in @([Environment]::GetFolderPath('CommonStartMenu'), [Environment]::GetFolderPath('StartMenu'))) {
  if (-not (Test-Path $d)) { continue }
  foreach ($lnk in (Get-ChildItem -Path $d -Recurse -Filter *.lnk)) {
    $s = ScoreOf (Clean $lnk.BaseName) $q
    if ($s -gt 0) {
      $tg = ''
      try { $tg = $shell.CreateShortcut($lnk.FullName).TargetPath } catch {}
      $cand += [PSCustomObject]@{ Score = $s; Nom = $lnk.BaseName; Aumid = ''; Exe = $tg }
    }
  }
}

# 3) Registre App Paths (commandes du type winword, excel, code...)
foreach ($rk in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths',
                  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths')) {
  if (-not (Test-Path $rk)) { continue }
  foreach ($k in (Get-ChildItem $rk)) {
    $s = ScoreOf (Clean ($k.PSChildName -replace '\.exe$', '')) $q
    if ($s -gt 0) {
      $exe = (Get-ItemProperty $k.PSPath).'(default)'
      if ($exe) { $cand += [PSCustomObject]@{ Score = ($s + 5); Nom = ($k.PSChildName -replace '\.exe$',''); Aumid = ''; Exe = $exe } }
    }
  }
}

if ($cand.Count -eq 0) { Write-Output 'NOTFOUND'; exit }
$best = $cand | Sort-Object -Property @{Descending=$true;Expression='Score'}, @{Descending=$false;Expression='Nom'} | Select-Object -First 1

if ($best.Exe -and (Test-Path $best.Exe)) { if (-not $SansLancer) { Start-Process $best.Exe }; Write-Output ('EXE|' + $best.Nom); exit }
if ($best.Aumid) { if (-not $SansLancer) { Start-Process explorer.exe -ArgumentList ('shell:AppsFolder\' + $best.Aumid) }; Write-Output ('APP|' + $best.Nom + '|' + $best.Aumid); exit }
Write-Output 'NOTFOUND'
