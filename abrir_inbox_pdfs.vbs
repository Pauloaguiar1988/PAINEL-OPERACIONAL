Option Explicit

Dim shell, fso, baseDir, pdfInboxDir
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
pdfInboxDir = baseDir & "\data\import\campinas\pdfs"

If Not fso.FolderExists(pdfInboxDir) Then
  fso.CreateFolder(pdfInboxDir)
End If

shell.Run "explorer.exe """ & pdfInboxDir & """", 1, False
