Set WshShell = CreateObject("WScript.Shell")
' Chạy ngầm server mà không hiện bất kỳ cửa sổ CMD nào (tham số 0)
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c node server/server.js", 0, False
