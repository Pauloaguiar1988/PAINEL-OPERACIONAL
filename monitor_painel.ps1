$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $root 'data'
$port = 5000
$healthUrl = "http://127.0.0.1:$port/api/health"
$stdoutLog = Join-Path $dataDir 'server.stdout.log'
$stderrLog = Join-Path $dataDir 'server.stderr.log'
$monitorLog = Join-Path $dataDir 'monitor.log'
$monitorPidFile = Join-Path $dataDir 'monitor.pid'

New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

function Write-MonitorLog([string]$text) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $monitorLog -Value "[$stamp] $text"
}

function Get-HealthyServer {
  try {
    $payload = (Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 3).Content | ConvertFrom-Json
    if ($payload -and $payload.ok -eq $true -and [string]$payload.rootDir -eq $root) {
      return $payload
    }
    return $null
  } catch {
    return $null
  }
}

function Get-ServerPidFromHealth {
  $health = Get-HealthyServer
  if ($health -and $health.pid) {
    return [int]$health.pid
  }
  return 0
}

function Is-PidAlive([int]$procId) {
  if ($procId -le 0) { return $false }
  return [bool](Get-Process -Id $procId -ErrorAction SilentlyContinue)
}

function Start-ServerProcess {
  $proc = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
  Write-MonitorLog "Servidor iniciado pelo watchdog (PID $($proc.Id))."
  return $proc.Id
}

Set-Content -Path $monitorPidFile -Value $PID -Encoding ASCII
Write-MonitorLog "Watchdog iniciado (PID $PID)."

while ($true) {
  try {
    $healthy = Get-HealthyServer
    if (-not $healthy) {
      $serverPidCandidate = Get-ServerPidFromHealth
      if (-not (Is-PidAlive $serverPidCandidate)) {
        Start-ServerProcess | Out-Null
        Start-Sleep -Milliseconds 1200
      }
    }
  } catch {
    Write-MonitorLog ("Falha no ciclo do watchdog: " + $_.Exception.Message)
  }
  Start-Sleep -Seconds 8
}
