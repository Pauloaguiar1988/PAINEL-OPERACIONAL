param(
  [Parameter(Mandatory = $true)]
  [string]$Token,

  [string]$BaseUrl = "http://localhost:5000"
)

<# 
Exemplo de uso:
.\scripts\test-ai-auth.ps1 -Token "COLE_TOKEN_AQUI"
#>

$ErrorActionPreference = "Stop"

$headers = @{
  "x-auth-token" = $Token
}

$body = @{
  cliente = "Cliente Teste"
  os = "V00000"
  equipamento = "Controlador de acesso"
  problema = "Equipamento nao responde"
} | ConvertTo-Json -Depth 10

$response = Invoke-RestMethod `
  -Uri "$BaseUrl/api/ai/analisar-os" `
  -Method POST `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body

$response | ConvertTo-Json -Depth 10
