Option Explicit

Dim shell, fso, baseDir, dataDir
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
dataDir = baseDir & "\data"

shell.Run "explorer.exe """ & dataDir & """", 1, False
