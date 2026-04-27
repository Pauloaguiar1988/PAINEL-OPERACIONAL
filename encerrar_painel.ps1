$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 5000
$pidFile = Join-Path $root 'data\server.pid'
$logFile = Join-Path $root 'data\launcher.log'
$monitorStopScript = Join-Path $root 'encerrar_monitor_painel.ps1'
$stopped = $false

function Show-Message([string]$text, [string]$title = 'Painel Operacional') {
  Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
  [System.Windows.MessageBox]::Show($text, $title) | Out-Null
}

function Write-LauncherLog([string]$text) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $logFile -Value "[$stamp] $text"
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

if (Test-Path $monitorStopScript) {
  try {
    & $monitorStopScript
    Write-LauncherLog 'Watchdog de monitoramento encerrado.'
  } catch {}
}

if (Test-Path $pidFile) {
  $pidValue = ((Get-Content -Path $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1) + '').Trim()
  if ($pidValue -match '^\d+$') {
    try {
      Stop-Process -Id ([int]$pidValue) -Force -ErrorAction Stop
      Write-LauncherLog "Servidor encerrado via PID file: $pidValue."
      $stopped = $true
    } catch {}
  }
  Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
}

if (-not $stopped) {
  foreach ($processId in Get-ListeningProcessIds) {
    try {
      $proc = Get-Process -Id $processId -ErrorAction Stop
      if ($proc.ProcessName -ieq 'node') {
        Stop-Process -Id $processId -Force -ErrorAction Stop
        Write-LauncherLog "Servidor encerrado pela porta ${port}: PID $processId."
        $stopped = $true
      }
    } catch {}
  }
}

if ($stopped) {
  Show-Message 'Servidor local do painel encerrado com sucesso.'
} else {
  Show-Message 'Nao encontrei um servidor Node ativo do painel para encerrar.'
}
