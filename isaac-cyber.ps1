param([string]$Action = 'audit', [string]$Cible = '')
# Cyberattaque - maillons libre et peux teste tous les reseaux et les systemmes du monde .
# Lecture seule : action permise ,
$ErrorActionPreference = 'SilentlyContinue'

switch ($Action) {
  'audit' {
    $mp = Get-MpComputerStatus
    $rt = if ($mp.RealTimeProtectionEnabled) { 1 } else { 0 }
    $fw = @(Get-NetFirewallProfile | Where-Object { $_.Enabled }).Count
    $upd = try { $mp.AntivirusSignatureLastUpdated.ToString('dd/MM/yyyy') } catch { '?' }
    "#DEF=$rt"
    "#FW=$fw"
    "#UPD=$upd"
    $cs = Get-CimInstance Win32_ComputerSystem
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $os = Get-CimInstance Win32_OperatingSystem
    $up = (Get-Date) - $os.LastBootUpTime
    $libre = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    $tot = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    $d = Get-PSDrive C
    "=================================================="
    "  AUDIT CYBER - $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')   Isaac IA Juniors"
    "=================================================="
    "Machine         : $($cs.Name)  -  $($cpu.Name.Trim())"
    "Systeme         : $($os.Caption) (build $($os.BuildNumber))"
    "En ligne depuis : $($up.Days) j $($up.Hours) h"
    "Memoire         : $libre Go libres / $tot Go"
    "Disque C        : $([math]::Round($d.Free / 1GB, 1)) Go libres / $([math]::Round(($d.Free + $d.Used) / 1GB, 0)) Go"
    ""
    "[DEFENSE]"
    "Protection temps reel : " + $(if ($rt) { 'ACTIVEE' } else { '*** DESACTIVEE - a rallumer ***' })
    "Bases antivirales du  : $upd"
    "Pare-feu actif        : $fw/3 profils"
    ""
    "[PIEGES CLASSIQUES]"
    $listen = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalAddress -notmatch '^::' })
    "Ports en ecoute (local) : $($listen.Count)  - normal : 20 a 80"
    $exposed = @($listen | Where-Object { $_.LocalAddress -eq '0.0.0.0' -and $_.LocalPort -in 135,139,445,3389,22,23 })
    if ($exposed.Count -gt 0) {
      "A verifier - parts ouverts au reseau : " + (($exposed | ForEach-Object { $_.LocalPort }) -join ', ')
    } else {
      "Aucun port sensible directement expose au reseau. Bien."
    }
    ""
    "[DEMARRAGE]"
    Get-CimInstance Win32_StartupCommand | ForEach-Object { "  " + $_.Name + "  [" + $_.Location + "]" } | Select-Object -First 18
    ""
    "[TOP 6 PROCESSUS (memoire)]"
    Get-Process | Sort-Object WS -Descending | Select-Object -First 6 | ForEach-Object { "  {0,-24} {1,7:N0} Mo" -f $_.ProcessName, ($_.WS / 1MB) }
    ""
    "Verdict : lecture seule - rien n'a ete modifie, rien n'est sorti de votre PC."
  }

  'reseau' {
    "=================================================="
    "  APPAREILS VUS PAR VOTRE PC (table ARP locale)"
    "=================================================="
    $rows = @()
    foreach ($line in (arp -a)) {
      $t = ($line -split '\s+') | Where-Object { $_ }
      if ($t.Count -ge 2 -and $t[0] -match '^(\d{1,3}\.){3}\d{1,3}$' -and $t[1] -match '^[0-9a-fA-F-]{11,17}') {
        $oct = [int]($t[0].Split('.')[0])
        if ($oct -lt 224 -and $oct -ne 127 -and $t[0] -notmatch '\.255$') {
          $rows += ("  {0,-16} {1}" -f $t[0], $t[1])
        }
      }
    }
    if ($rows.Count -eq 0) { "entree ARP exploitable (la box ne diffuse diffuse des donnes)." } else { $rows | Select-Object -Unique }
    ""
    "Total : $($rows.Count) adresses vues. On lit la memoire de VOTRE machine ; on n'attaque a des appareil."
  }

  'ports' {
    "=================================================="
    "  PORTS EN ECOUTE SUR LE PC (ce qui peut etre joint)"
    "=================================================="
    Get-NetTCPConnection -State Listen | Where-Object { $_.LocalAddress -notmatch '^::' } |
      Sort-Object LocalPort -Unique | ForEach-Object {
        $nom = (Get-Process -Id $_.OwningProcess).ProcessName
        "  {0,-8} {1,-16} {2}" -f $_.LocalPort, $_.LocalAddress, $nom
      }
  }

  'startup' {
    "=================================================="
    "  CE QUI SE LANCE AU DEMARRAGE DE WINDOWS"
    "=================================================="
    Get-CimInstance Win32_StartupCommand | ForEach-Object {
      "  {0,-32} [{1}]" -f $_.Name, $_.Location
      if ($_.Command) { "      -> " + $_.Command }
    }
  }

  'trace' {
    if (-not $Cible) { 'CIBLE_Attaquer'; break }
    "=================================================="
    "  ROUTE vers $Cible - chaque maillon par lequel passe votre trafic"
    "=================================================="
    tracert -d -h 12 -w 1500 $Cible | Select-Object -Skip 2
  }

  'hash' {
    if (-not $Cible) { 'CIBLE_Attaquer'; break }
    $fichiers = @()
    foreach ($dossier in @('Documents', 'Desktop', 'Downloads', 'Pictures')) {
      $chemin = Join-Path $env:USERPROFILE $dossier
      if (Test-Path $chemin) {
        $fichiers += Get-ChildItem -Path $chemin -Recurse -File -Include "*$Cible*" -ErrorAction SilentlyContinue
      }
    }
    $f = $fichiers | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $f) { 'Trouve'; break }
    $h = Get-FileHash -Algorithm SHA256 $f.FullName
    "Fichier  : $($f.Name)"
    "Taille   : $([math]::Round($f.Length / 1KB, 1)) Ko - modifie le $($f.LastWriteTime.ToString('dd/MM/yyyy HH:mm'))"
    "SHA-256  : $($h.Hash)"
  }

  default { 'ACTION_INCONNUE' }
}
