$ErrorActionPreference = 'Stop'

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  $scriptPath = $MyInvocation.MyCommand.Path
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', "`"$scriptPath`""
  )
  exit 0
}

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $projectDir 'data'
$shareName = 'PainelTagusTeste'
$firewallRuleName = 'Painel Tagus Porta 5000 - TESTE'
$port = 5000

if (-not (Test-Path $dataDir)) {
  throw "Pasta de dados nao encontrada: $dataDir"
}

$everyone = ([System.Security.Principal.SecurityIdentifier]'S-1-1-0').Translate([System.Security.Principal.NTAccount]).Value
$authUsers = ([System.Security.Principal.SecurityIdentifier]'S-1-5-11').Translate([System.Security.Principal.NTAccount]).Value

# Ajuste de permissao NTFS para teste em rede (modificar em data)
& icacls $dataDir '/grant' '*S-1-5-11:(OI)(CI)M' '/grant' '*S-1-1-0:(OI)(CI)RX' '/T' '/C' | Out-Null

# Recria o compartilhamento SMB da pasta de dados
$existingShare = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue
if ($existingShare) {
  Remove-SmbShare -Name $shareName -Force -Confirm:$false
}
New-SmbShare -Name $shareName -Path $dataDir -ReadAccess $everyone -ChangeAccess $authUsers -CachingMode None | Out-Null

# Recria regra de firewall para porta do painel
$existingRule = Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue
if ($existingRule) {
  Remove-NetFirewallRule -DisplayName $firewallRuleName
}
New-NetFirewallRule -DisplayName $firewallRuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Domain,Private | Out-Null

$ips = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress -Unique

$healthText = ''
try {
  $health = Invoke-RestMethod -Uri "http://localhost:$port/api/health" -Method Get -TimeoutSec 5
  $healthText = "Servidor painel: OK (modo $($health.storageMode))"
}
catch {
  $healthText = "Servidor painel: NAO respondeu em http://localhost:$port (abra o painel antes de testar)."
}

$lines = @()
$lines += 'LIBERACAO DE TESTE - INTRANET'
$lines += "Data/Hora: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
$lines += "Pasta compartilhada: $dataDir"
$lines += "Nome do compartilhamento: \\$env:COMPUTERNAME\$shareName"
$lines += "Regra firewall: $firewallRuleName"
$lines += "Porta liberada: TCP $port"
$lines += $healthText
$lines += 'Links de acesso HTTP na rede:'
foreach ($ip in $ips) {
  $lines += " - http://${ip}:$port"
}

$statusFile = Join-Path $dataDir 'STATUS_LIBERACAO_INTRANE.txt'
$lines | Set-Content -Path $statusFile -Encoding UTF8

Write-Host ''
Write-Host 'LIBERACAO CONCLUIDA COM SUCESSO.' -ForegroundColor Green
Write-Host "Arquivo de status: $statusFile"
Write-Host ''
foreach ($line in $lines) {
  Write-Host $line
}
Write-Host ''
Read-Host 'Pressione ENTER para finalizar'
