' ============================================================
'  ISAAC IA JUNIORS - Démon de démarrage silencieux
'  Lance le cerveau (fenêtre cachée) puis l'interface en mode
'  application (sans onglets ni barre d'adresse).
' ============================================================

Dim shell, fso, proj, browser, http, serverUp

Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")
proj = fso.GetParentFolderName(WScript.ScriptFullName)

' --- Trouver le navigateur (Edge en priorité, puis Chrome) ---
browser = shell.ExpandEnvironmentStrings("%ISAAC_BROWSER%")
If browser = "" Or InStr(browser, "%") > 0 Then
  Dim pf, pf86, paths, p
  pf   = shell.ExpandEnvironmentStrings("%ProgramFiles%")
  pf86 = shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%")
  paths = Array( _
    pf86 & "\Microsoft\Edge\Application\msedge.exe", _
    pf   & "\Microsoft\Edge\Application\msedge.exe", _
    pf   & "\Google\Chrome\Application\chrome.exe", _
    pf86 & "\Google\Chrome\Application\chrome.exe")
  browser = ""
  For Each p In paths
    If fso.FileExists(p) Then browser = p : Exit For
  Next
  If browser = "" Then browser = "msedge"
End If

' --- Le cerveau tourne-t-il déjà ? (ping HTTP sur 3777) ---
serverUp = False
On Error Resume Next
Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
http.Open "GET", "http://localhost:3777/api/ping", False
http.Send
If Err.Number = 0 Then
  If http.Status = 200 Then serverUp = True
  Err.Clear
End If
On Error GoTo 0

' --- Démarrer le serveur caché si besoin ---
If Not serverUp Then
  shell.CurrentDirectory = proj
  shell.Run "node server.js", 0, False
  WScript.Sleep 2500
End If

' --- Fenêtre d'application dédiée (profil Isaac séparé, hors navigateur normal) ---
shell.Run """" & browser & """ --new-window --app=http://localhost:3777 " & _
          "--user-data-dir=""" & proj & "\isaac-profile"" --window-size=1024,780", 1, False
