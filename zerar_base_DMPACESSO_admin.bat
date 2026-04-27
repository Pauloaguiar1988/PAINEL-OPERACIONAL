@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo   RESET DA BASE SQL: DMPACESSO
echo ==========================================
echo.

powershell -NoProfile -Command "Start-Service -Name 'MSSQL$SQLEXPRESS'" >nul 2>&1

sqlcmd -S .\SQLEXPRESS -E -b -i ".\sql\reset_dmpacesso.sql"
if errorlevel 1 (
  echo.
  echo FALHA ao resetar DMPACESSO.
  echo Verifique se:
  echo 1) voce executou este arquivo como ADMINISTRADOR
  echo 2) a instancia SQLEXPRESS esta instalada
  echo.
  pause
  exit /b 1
)

echo.
echo Base DMPACESSO resetada com sucesso.
echo.
pause
endlocal
