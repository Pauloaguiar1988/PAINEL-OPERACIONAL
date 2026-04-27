$ErrorActionPreference = 'SilentlyContinue'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $root 'data'
$monitorPidFile = Join-Path $dataDir 'monitor.pid'
$monitorLog = Join-Path $dataDir 'monitor.log'

function Write-MonitorLog([string]$text) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $monitorLog -Value "[$stamp] $text"
}

if (Test-Path $monitorPidFile) {
  $pidValue = ((Get-Content -Path $monitorPidFile | Select-Object -First 1) + '').Trim()
  if ($pidValue -match '^\d+$') {
    Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue
    Write-MonitorLog "Watchdog encerrado via PID file: $pidValue."
  }
  Remove-Item -Path $monitorPidFile -Force -ErrorAction SilentlyContinue
}

$pids = Get-CimInstance Win32_Process |
  Where-Object { $_.Name -match 'powershell' -and $_.CommandLine -match 'monitor_painel.ps1' } |
  Select-Object -ExpandProperty ProcessId
foreach ($pid in $pids) {
  if ($pid -match '^\d+$') {
    Stop-Process -Id ([int]$pid) -Force -ErrorAction SilentlyContinue
    Write-MonitorLog "Watchdog encerrado por busca de processo: $pid."
  }
}
