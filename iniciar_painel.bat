@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo.
    echo Falha ao instalar dependencias. Verifique se o Node.js esta instalado com: node -v
    pause
    exit /b 1
  )
) else (
  echo Dependencias ja disponiveis.
)
echo.
echo Iniciando servidor local em http://localhost:5000
start "Painel Node" cmd /k "cd /d %~dp0 && npm start"
timeout /t 3 /nobreak >nul
start "" http://localhost:5000
exit /b
