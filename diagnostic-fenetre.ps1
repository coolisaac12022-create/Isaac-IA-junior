Write-Output "== 1. Les fenetres qui parlent a 3777 =="
Get-CimInstance Win32_Process -Filter "Name='msedge.exe' or Name='chrome.exe'" |
  Where-Object { $_.CommandLine -match '3777|isaac-profile' } |
  ForEach-Object { "PID={0} {1}`n   {2}" -f $_.ProcessId, $_.Name, $_.CommandLine }

Write-Output "== 2. Les processus node =="
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  ForEach-Object { "PID={0}  {1}" -f $_.ProcessId, $_.CommandLine }

Write-Output "== 3. Ecoutes TCP utiles =="
foreach ($port in 3777, 3778, 3799) {
  $l = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($l) { "port $port -> " + $l.LocalAddress + " PID " + $l.OwningProcess } else { "port $port -> RIEN EN ECOUTE" }
}

Write-Output "== 4. localhost resout-il ? =="
try { $r = Resolve-DnsName localhost -ErrorAction Stop; $r | ForEach-Object { "localhost -> " + $_.IPAddress } } catch { "Resolve-DnsName a echoue : " + $_.Exception.Message }
Write-Output "== 5. le fichier hosts =="
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
$lignes = Get-Content $hosts -ErrorAction SilentlyContinue | Where-Object { $_ -and ($_ -notmatch '^\s*#') }
if ($lignes) { $lignes } else { "hosts : aucune ligne active" }
