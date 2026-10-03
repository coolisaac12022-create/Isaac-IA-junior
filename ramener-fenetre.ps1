Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Fenetre {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool repaint);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder t, int n);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public struct RECT { public int L, T, R, B; }
}
"@
$cibles = @()
$cb = [Fenetre+EnumProc]{
  param($h, $l)
  $sb = New-Object System.Text.StringBuilder 260
  [Fenetre]::GetWindowText($h, $sb, 260) | Out-Null
  $titre = $sb.ToString()
  if ($titre -match 'Aelyra|Aegis|Onyx|Jeanette') {
    $pidOut = 0
    [Fenetre]::GetWindowThreadProcessId($h, [ref]$pidOut) | Out-Null
    $r = New-Object Fenetre+RECT
    [Fenetre]::GetWindowRect($h, [ref]$r) | Out-Null
    $min = [Fenetre]::IsIconic($h)
    "TROUVE PID=$pidOut titre='$titre' rect=($($r.L),$($r.T),$($r.R),$($r.B)) minimise=$min"
    $script:cibles += ,@($h, $pidOut)
  }
  return $true
}
[Fenetre]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if (-not $cibles -or $cibles.Count -eq 0) { "AUCUNE fenetre Aelyra visible par Windows" ; exit 0 }
foreach ($c in $cibles) {
  $h = $c[0]
  "RESTAURATION PID=" + $c[1]
  [Fenetre]::ShowWindow($h, 9) | Out-Null      # SW_RESTORE
  [Fenetre]::MoveWindow($h, 60, 60, 1180, 820, $true) | Out-Null
  [Fenetre]::SetForegroundWindow($h) | Out-Null
}
"fait"
