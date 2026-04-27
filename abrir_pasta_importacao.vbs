Option Explicit

Dim shell, fso, baseDir, importDir
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
importDir = baseDir & "\data\import\campinas"

If Not fso.FolderExists(importDir) Then
  If Not fso.FolderExists(baseDir & "\data\import") Then
    fso.CreateFolder(baseDir & "\data\import")
  End If
  fso.CreateFolder(importDir)
End If

shell.Run "explorer.exe """ & importDir & """", 1, False
