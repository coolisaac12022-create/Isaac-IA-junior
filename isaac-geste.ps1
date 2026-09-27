param([string]$Geste, [string]$Cible = '', [int]$Fois = 1)
$ErrorActionPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class ClavierIsaac {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
'@

function Tap([byte]$vk, [int]$n) {
  for ($i = 0; $i -lt $n; $i++) {
    [ClavierIsaac]::keybd_event($vk, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 25
    [ClavierIsaac]::keybd_event($vk, 0, 2, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 25
  }
}

switch ($Geste) {
  'volume-moins' { Tap 0xAF $Fois; 'OK'; break }
  'volume-plus'  { Tap 0xB0 $Fois; 'OK'; break }
  'volume-coupe' { Tap 0xAD 1; 'OK'; break }
  'lecture'      { Tap 0xB3 1; 'OK'; break }
  'suivant'      { Tap 0xB0 1; 'OK'; break }
  'bureau'       {
    $sh = New-Object -ComObject Shell.Application
    $sh.MinimizeAll()
    'OK'; break
  }
  'restaurer'    {
    $sh = New-Object -ComObject Shell.Application
    $sh.UndoMinimizeALL()
    'OK'; break
  }
  'imprimer'     {
    $w = New-Object -ComObject WScript.Shell
    Start-Sleep -Milliseconds 250
    $w.SendKeys('^p')
    'OK'; break
  }
  'enregistrer'  {
    $w = New-Object -ComObject WScript.Shell
    Start-Sleep -Milliseconds 250
    $w.SendKeys('^s')
    'OK'; break
  }
  'fermer-fenetre' {
    $w = New-Object -ComObject WScript.Shell
    Start-Sleep -Milliseconds 250
    $w.SendKeys('%{F4}')
    'OK'; break
  }
  'corbeille'    {
    Clear-RecycleBin -Force
    'OK'; break
  }
  'tuer'         {
    if (-not $Cible) { 'NOMMANQUANT'; break }
    $procs = Get-Process | Where-Object { $_.ProcessName -match $Cible -or $_.MainWindowTitle -match $Cible }
    if (-not $procs) { 'INTROUVABLE'; break }
    $procs | ForEach-Object { $_ | Stop-Process -Force }
    'OK|' + (($procs | Select-Object -First 1).ProcessName)
    break
  }
  'luminosite-plus' {
    $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods
    if (-not $m) { 'UNSUPPORTED'; break }
    $cur = (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness
    $cible = [Math]::Min(100, [int]$cur + 20)
    $m | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Brightness = $cible; Timeout = 0 } | Out-Null
    'OK|' + $cible
    break
  }
  'luminosite-moins' {
    $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods
    if (-not $m) { 'UNSUPPORTED'; break }
    $cur = (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness
    $cible = [Math]::Max(5, [int]$cur - 20)
    $m | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Brightness = $cible; Timeout = 0 } | Out-Null
    'OK|' + $cible
    break
  }
  'alterner'     {
    $w = New-Object -ComObject WScript.Shell
    Start-Sleep -Milliseconds 200
    $w.SendKeys('%{TAB}')
    'OK'; break
  }
  'ecran-off'    {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class EcranIsaac {
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, int msg, IntPtr w, IntPtr l, int flags, int timeout, out IntPtr result);
  public static void Power(int code) { IntPtr r; SendMessageTimeout(new IntPtr(0xffff), 0x0112, new IntPtr(0xF170), new IntPtr(code), 2, 1000, out r); }
}
'@
    [EcranIsaac]::Power(2)   # 2 = le moniteur s'eteint
    'OK'; break
  }
  'ecran-on'     {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class EcranIsaacOn {
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, int msg, IntPtr w, IntPtr l, int flags, int timeout, out IntPtr result);
  public static void Power(int code) { IntPtr r; SendMessageTimeout(new IntPtr(0xffff), 0x0112, new IntPtr(0xF170), new IntPtr(code), 2, 1000, out r); }
}
'@
    [EcranIsaacOn]::Power(-1) # -1 = le moniteur se rallume
    # Petite tape sans consequence pour reveiller Windows si l'ecran etait verrouille
    [ClavierIsaac]::keybd_event(0xA2, 0, 0, [UIntPtr]::Zero)
    [ClavierIsaac]::keybd_event(0xA2, 0, 2, [UIntPtr]::Zero)
    'OK'; break
  }
  'fond-ecran'   {
    $dossiers = @((Join-Path $env:USERPROFILE 'Pictures'), 'C:\Windows\Web\Wallpaper', (Join-Path $env:USERPROFILE 'Downloads'))
    $imgs = @()
    foreach ($d in $dossiers) {
      if (Test-Path $d) { $imgs += Get-ChildItem -Path $d -Recurse -Include *.jpg,*.jpeg,*.png -ErrorAction SilentlyContinue | Select-Object -First 400 }
    }
    if ($imgs.Count -eq 0) { 'AUCUNEIMAGE'; break }
    $choix = $imgs[(Get-Random -Maximum $imgs.Count)].FullName
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class FondIsaac {
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
  public static void Set(string p) { SystemParametersInfo(20, 0, p, 3); }
}
'@
    [FondIsaac]::Set($choix)
    'OK|' + (Split-Path $choix -Leaf)
    break
  }
  'recherche-windows' {
    $w = New-Object -ComObject WScript.Shell
    $w.SendKeys('^{ESC}')
    Start-Sleep -Milliseconds 400
    $w.SendKeys($Cible + '{ENTER}')
    'OK'; break
  }
  default { 'GESTE_INCONNU' }
}
