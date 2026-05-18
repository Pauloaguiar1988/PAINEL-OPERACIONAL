param(
  [string]$Token = "",
  [string]$BaseUrl = "http://localhost:5000"
)

$ErrorActionPreference = "Stop"

function Read-LocalEnvValue([string]$Key) {
  $envPath = Join-Path (Get-Location) ".env"
  if (!(Test-Path $envPath)) { return "" }
  foreach ($raw in Get-Content $envPath) {
    $line = [string]$raw
    if (!$line.Trim() -or $line.Trim().StartsWith("#")) { continue }
    $idx = $line.IndexOf("=")
    if ($idx -le 0) { continue }
    $k = $line.Substring(0, $idx).Trim()
    if ($k -ne $Key) { continue }
    $v = $line.Substring($idx + 1).Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    return $v
  }
  return ""
}

function Assert-True($Condition, [string]$Message) {
  if (!$Condition) { throw $Message }
}

if (!$Token) {
  $password = Read-LocalEnvValue "PAINEL_BOOTSTRAP_ADMIN_PASSWORD"
  Assert-True $password "Token nao informado e senha admin nao encontrada em .env."
  $login = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body (@{
    username = "admin_campinas"
    password = $password
    remember = $true
  } | ConvertTo-Json)
  $Token = $login.token
}

$headers = @{ "x-auth-token" = $Token }

$health = Invoke-RestMethod -Uri "$BaseUrl/api/health" -Method GET
$status = Invoke-RestMethod -Uri "$BaseUrl/api/system/status" -Method GET
Assert-True ($health.officialRootMatch -eq $true) "officialRootMatch falhou."
Assert-True ($health.port -eq 5000) "Porta diferente de 5000."
Assert-True ($status.base.officialRootMatch -eq $true) "system/status officialRootMatch falhou."

$scenarios = @(
  @{
    name = "garantia_fabrica"
    body = @{
      cliente = "Cliente Garantia"
      os = "VFASE7-A"
      equipamento = "Controlador"
      problema = "Falha sem mau uso"
      garantia = "Garantia de fabrica vigente"
      diagnostico = "Teste funcional executado com evidencia fotografica"
      evidencias = @("foto inicial", "teste funcional")
    }
  },
  @{
    name = "sem_debito_erro_interno"
    body = @{
      cliente = "Cliente Software"
      os = "VFASE7-B"
      equipamento = "Sistema"
      problema = "Erro causado por atualizacao de versao anterior"
      garantia = "Garantia de servico"
      diagnostico = "Log de versao confirmou falha apos atualizacao"
      evidencias = @("log de versao", "teste reproduzido")
    }
  },
  @{
    name = "mau_uso"
    body = @{
      cliente = "Cliente Mau Uso"
      os = "VFASE7-C"
      equipamento = "Controlador"
      problema = "Dano por mau uso identificado"
      diagnostico = "Laudo fotografico indica uso indevido"
      evidencias = @("foto do dano", "relato tecnico")
    }
  },
  @{
    name = "dados_incompletos"
    body = @{
      cliente = ""
      os = "VFASE7-D"
      problema = ""
    }
  },
  @{
    name = "critica_sem_testes"
    body = @{
      cliente = "Cliente Critico"
      os = "VFASE7-E"
      equipamento = "Controlador"
      problema = "Falha critica operacional sem testes esgotados"
    }
  }
)

$results = @()
foreach ($scenario in $scenarios) {
  $response = Invoke-RestMethod -Uri "$BaseUrl/api/ai/analisar-os" -Method POST -Headers $headers -ContentType "application/json" -Body ($scenario.body | ConvertTo-Json -Depth 10)
  $analysis = $response.result.aiAnalysis
  Assert-True ($response.success -eq $true) "Analise falhou no cenario $($scenario.name)."
  Assert-True ($analysis.version -eq "IA_CONTRACT_V1") "Contrato IA v1 ausente no cenario $($scenario.name)."
  Assert-True ($null -ne $response.result.serviceType) "Campo legado serviceType ausente."
  Assert-True ($response.result.recomendacoes -is [array]) "recomendacoes nao e array."
  Assert-True ($analysis.review.checklist -is [array]) "review.checklist nao e array."
  $json = $response | ConvertTo-Json -Depth 20
  Assert-True ($json.Contains("IA_CONTRACT_V1")) "Serializacao sem contrato IA v1."
  $results += [pscustomobject]@{
    scenario = $scenario.name
    serviceType = $response.result.serviceType
    warrantyType = $response.result.warrantyType
    billing = $analysis.decisao.cobranca
    confidence = $analysis.confidence.geral
    reviewRequired = $analysis.review.required
    escalation = $analysis.escalonamento.nivel
  }
}

[pscustomobject]@{
  ok = $true
  health = $health.ok
  systemStatus = $status.ok
  scenarios = $results
} | ConvertTo-Json -Depth 20
