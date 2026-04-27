$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 5000
$serverUrl = "http://localhost:$port"
$healthUrl = "$serverUrl/api/health"
$dataDir = Join-Path $root 'data'
$pidFile = Join-Path $dataDir 'server.pid'
$logFile = Join-Path $dataDir 'launcher.log'
$stdoutLog = Join-Path $dataDir 'server.stdout.log'
$stderrLog = Join-Path $dataDir 'server.stderr.log'
$monitorScript = Join-Path $root 'monitor_painel.ps1'
$monitorPidFile = Join-Path $dataDir 'monitor.pid'
$expressFlag = Join-Path $root 'node_modules\express'

function Show-Message([string]$text, [string]$title = 'Painel Operacional') {
  Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
  [System.Windows.MessageBox]::Show($text, $title) | Out-Null
}

function Write-LauncherLog([string]$text) {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $logFile -Value "[$stamp] $text"
}

function Get-ServerHealth {
  try {
    return (Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 2).Content | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Get-ListeningProcessIds {
  $ids = @()
  try {
    $lines = cmd /c "netstat -ano -p tcp" 2>$null
    foreach ($line in $lines) {
      if ($line -match "^\s*TCP\s+\S+:$port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
        $ids += [int]$matches[1]
      }
    }
  } catch {}
  return $ids | Select-Object -Unique
}

function Get-ProcessLabel([int]$processId) {
  try {
    $proc = Get-Process -Id $processId -ErrorAction Stop
    return "$($proc.ProcessName) (PID $processId)"
  } catch {
    return "PID $processId"
  }
}

function Stop-NodeListeners {
  $stoppedAny = $false
  foreach ($processId in Get-ListeningProcessIds) {
    try {
      $proc = Get-Process -Id $processId -ErrorAction Stop
      if ($proc.ProcessName -ieq 'node') {
        Write-LauncherLog "Encerrando listener Node na porta ${port}: PID $processId."
        Stop-Process -Id $processId -Force -ErrorAction Stop
        $stoppedAny = $true
      }
    } catch {
      Write-LauncherLog "Falha ao encerrar PID $processId na porta ${port}: $($_.Exception.Message)"
    }
  }
  if ($stoppedAny) {
    Start-Sleep -Milliseconds 900
  }
  return $stoppedAny
}

function Ensure-Commands {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Show-Message 'Node.js nao foi encontrado neste computador. Instale o Node.js para abrir o painel.'
    exit 1
  }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Show-Message 'npm nao foi encontrado neste computador. Reinstale o Node.js para usar o painel.'
    exit 1
  }
}

function Ensure-Dependencies {
  if (Test-Path $expressFlag) {
    return
  }

  Write-LauncherLog 'Dependencias ausentes. Executando npm install.'
  $install = Start-Process -FilePath 'npm.cmd' -ArgumentList @('install', '--no-fund', '--no-audit') -WorkingDirectory $root -WindowStyle Hidden -Wait -PassThru
  if ($install.ExitCode -ne 0) {
    Write-LauncherLog "npm install falhou com codigo $($install.ExitCode)."
    Show-Message 'Falha ao instalar as dependencias do painel. Use o iniciar_painel.bat se quiser ver o log tecnico.'
    exit 1
  }
}

function Start-PanelServer {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
  Remove-Item -Path $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue
  Write-LauncherLog "Iniciando servidor local em $root."
  $proc = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
  Set-Content -Path $pidFile -Value $proc.Id -Encoding ascii
  return $proc
}

function Ensure-WatchdogRunning {
  if (-not (Test-Path $monitorScript)) {
    Write-LauncherLog 'Watchdog nao encontrado. Seguindo sem monitoramento automatico.'
    return
  }

  if (Test-Path $monitorPidFile) {
    $pidValue = ((Get-Content -Path $monitorPidFile -ErrorAction SilentlyContinue | Select-Object -First 1) + '').Trim()
    if ($pidValue -match '^\d+$') {
      $running = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
      if ($running) {
        Write-LauncherLog "Watchdog ja ativo (PID $pidValue)."
        return
      }
    }
  }

  $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$monitorScript`"")
  $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden -PassThru
  Write-LauncherLog "Watchdog iniciado (PID $($proc.Id))."
}

Ensure-Commands
Ensure-Dependencies

$health = Get-ServerHealth
if ($health -and $health.rootDir -eq $root) {
  Write-LauncherLog 'Servidor ja estava ativo. Abrindo navegador.'
  Ensure-WatchdogRunning
  Start-Process $serverUrl | Out-Null
  exit 0
}

$listenerIds = Get-ListeningProcessIds
if ($listenerIds.Count -gt 0) {
  Write-LauncherLog ("Porta $port ocupada por: " + (($listenerIds | ForEach-Object { Get-ProcessLabel $_ }) -join ', '))
  $stopped = Stop-NodeListeners
  $health = Get-ServerHealth
  if (($listenerIds.Count -gt 0) -and (-not $stopped) -and (-not $health)) {
    Show-Message "A porta 5000 esta ocupada por outro processo. Feche o processo que usa essa porta ou use o iniciar_painel.bat para diagnosticar. Log: $logFile"
    exit 1
  }
}

$proc = Start-PanelServer
$serverReady = $false

for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  $health = Get-ServerHealth
  if ($health -and $health.rootDir -eq $root) {
    $serverReady = $true
    break
  }

  if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) {
    Write-LauncherLog 'O processo Node encerrou antes de responder ao health-check.'
    break
  }
}

if (-not $serverReady) {
  $stderrTail = ''
  try {
    if (Test-Path $stderrLog) {
      $stderrTail = ((Get-Content -Path $stderrLog -Tail 8 -ErrorAction Stop) -join ' | ')
    }
  } catch {}
  if ($stderrTail) {
    Write-LauncherLog "Ultimo erro do servidor: $stderrTail"
  } else {
    Write-LauncherLog 'Servidor nao respondeu ao health-check e nao retornou erro no stderr.'
  }
  Show-Message "O servidor local nao respondeu em $serverUrl. Use o iniciar_painel.bat para diagnosticar. Log: $logFile"
  exit 1
}

Write-LauncherLog 'Servidor pronto. Abrindo navegador.'
Ensure-WatchdogRunning
Start-Process $serverUrl | Out-Null
