Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$ecran = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap($ecran.Width, $ecran.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($ecran.Location, [System.Drawing.Point]::Empty, $ecran.Size)
$chemin = Join-Path $PSScriptRoot 'capture-ecran.png'
$bmp.Save($chemin, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
"Capture enregistree : " + $chemin + "  (" + $ecran.Width + "x" + $ecran.Height + ")"
