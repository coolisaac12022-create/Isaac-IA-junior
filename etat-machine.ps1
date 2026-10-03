$os = Get-CimInstance Win32_OperatingSystem
"RAM_libre_MB = " + [int]($os.FreePhysicalMemory/1024)
"RAM_total_MB = " + [int]($os.TotalVisibleMemorySize/1024)
$groupes = Get-Process -ErrorAction SilentlyContinue | Group-Object ProcessName
foreach ($g in $groupes) {
  $somme = ($g.Group | Measure-Object WorkingSet64 -Sum).Sum
  if ($somme -gt 60MB) { "{0,-14} nb={1,-3} RAM_MB={2}" -f $g.Name, $g.Count, [int]($somme/1MB) }
}
$c = Get-PSDrive C
"Disque_C_libre_MB = " + [int]($c.Free/1MB)
"CPU_charge_pct = " + [int](Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$ecoute = Get-NetTCPConnection -LocalPort 3777 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ecoute) {
  $p = Get-Process -Id $ecoute.OwningProcess -ErrorAction SilentlyContinue
  if ($p) { "Cerveau PID={0} RAM_MB={1} depuis={2}" -f $p.Id, [int]($p.WorkingSet64/1MB), $p.StartTime }
} else { "AUCUNE ECOUTE SUR 3777" }
