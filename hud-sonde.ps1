$ErrorActionPreference = 'SilentlyContinue'
Write-Output "--- Charge CPU (WMI, 2 echantillons a 2 s) ---"
1..2 | ForEach-Object {
  $v = Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage
  Write-Output ("LoadPercentage = " + ($v -join ','))
  Start-Sleep -Seconds 2
}
Write-Output ""
Write-Output "--- 6 processus les plus gourmands en RAM ---"
Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 6 Name, Id, @{n='RAM_Mo';e={[math]::Round($_.WorkingSet64/1MB)}} | Format-Table -AutoSize | Out-String -Width 120
