# IA Operacional

## Objetivo

A camada de IA Operacional prepara o Painel Operacional para analises assistidas de OS, laudos, cobranca, SLA, emails tecnicos e resumos executivos. A Fase 7 transforma a analise de OS em motor de decisao operacional baseado em fluxograma tecnico, padrao oficial de laudo e regras de validacao/encerramento.

## Motor Automatico IA

A IA nao depende do botao do painel para existir. Ao salvar registros com `import_os_audit_json`, o backend tenta enriquecer cada OS com `aiAnalysis` de forma segura. Se a OS ja tiver `aiAnalysis.version = IA_CONTRACT_V1` e o hash dos dados base nao mudou, ela nao e reprocessada. Se houver falha, o painel continua carregando e a OS pode ser marcada para revisao.

Fluxo previsto:

1. Importacao ou atualizacao de OS.
2. Analise automatica local por regras.
3. Persistencia do contrato IA junto a OS.
4. Consumo por indicadores, tabelas, alertas e fila de revisao.
5. Botao do painel apenas para reprocessar/visualizar detalhes.

## Contrato IA v1

O contrato oficial e salvo em `os.aiAnalysis`:

```json
{
  "version": "IA_CONTRACT_V1",
  "processedAt": "ISO_DATE",
  "source": "mock",
  "status": "processed",
  "legacyCompatible": true,
  "classificacao": {
    "tipoAtendimento": "",
    "tipoLaudo": "",
    "serviceType": "",
    "warrantyType": "",
    "probableCause": "",
    "outcomeType": ""
  },
  "decisao": {
    "operacional": "",
    "cobranca": "",
    "justificativa": ""
  },
  "escalonamento": {
    "necessario": false,
    "nivel": "nenhum",
    "destino": "",
    "justificativa": ""
  },
  "evidencias": [],
  "pendencias": [],
  "laudo": {
    "objetivo": "",
    "cenarioEncontradoDiagnostico": "",
    "acoesRealizadas": [],
    "resultadoStatusFinal": "",
    "pendenciasResponsaveis": [],
    "conclusaoTecnica": "",
    "acompanhamento": ""
  },
  "confidence": {
    "geral": "media",
    "motivo": ""
  },
  "review": {
    "required": false,
    "priority": "media",
    "reason": "",
    "recommendedReviewer": "",
    "checklist": []
  },
  "decisionTrace": []
}
```

Campos legados continuam disponiveis no retorno normalizado, incluindo `serviceType`, `warrantyType`, `probableCause`, `outcomeType`, `reviewQueue`, `reviewPriority`, `reviewReason`, `recommendedReviewer`, `reviewChecklist`, `reviewQueueSummary`, `resumo`, `recomendacoes` e `alertas`.

## Regras Operacionais

As regras puras ficam em `ia/rules`:

- `classificacao.js`: tipo de atendimento, garantia, causa provavel, resultado e tipo de laudo.
- `cobranca.js`: decisao de cobranca.
- `escalonamento.js`: nivel 1 tecnico lider, SAP, engenharia, comercial ou gerente operacional da filial Campinas.
- `confidence.js`: confianca alta, media ou baixa.
- `laudo.js`: estrutura oficial do laudo.

Regras principais de cobranca:

- Garantia de fabrica vigente sem mau uso: somente deslocamento se previsto.
- Garantia de servico ou erro interno/software: sem debito total.
- Mau uso ou infraestrutura do cliente: cobranca aplicavel.
- Visita improdutiva: cobrar conforme abertura da OS.
- Caso inconclusivo: revisao humana obrigatoria.

Regras principais de escalonamento:

- Tecnico deve esgotar testes antes de escalar.
- Bruno atua como tecnico lider no nivel 1 antes de SAP.
- Paulo atua como gerente operacional da filial Campinas para decisao operacional, cobranca sensivel e alinhamento com cliente.
- SAP apenas apos evidencia tecnica suficiente.
- Engenharia para bug/produto.
- Comercial para cobranca, proposta, contrato ou negociacao.

## Estrutura

- `ia/prompts`: prompts reutilizaveis por tipo de tarefa.
- `ia/templates`: modelos prontos para laudos, emails, relatorios e alertas.
- `ia/playbooks`: procedimentos operacionais passo a passo.
- `ia/outputs`: area reservada para saidas futuras, sem persistencia automatica nesta fase.
- `services/aiService.js`: service central de IA.

## Padrao dos prompts

Todos os prompts usam a estrutura:

- `CONTEXTO:`
- `OBJETIVO:`
- `REGRAS:`
- `FORMATO DE SAIDA:`

Esse padrao facilita revisao tecnica, reuso e futura integracao com leitura dinamica de prompts.

## Leitura dinamica de prompts

O service expoe:

```js
loadPrompt(promptName)
montarPrompt(promptName, dadosContexto)
```

`loadPrompt` carrega arquivos de `ia/prompts` por nome seguro, sempre com extensao `.txt`. `montarPrompt` combina o prompt base com os dados operacionais enviados ao endpoint. O prompt montado fica preparado para integracao futura, mas nao e enviado a provedor externo nesta fase.

## Modo mock

O modo e definido por:

```js
const isMock = !process.env.OPENAI_API_KEY
```

O modo mock continua sendo o padrao. A chamada real so ocorre quando todas as condicoes abaixo forem verdadeiras ao mesmo tempo:

- `OPENAI_API_KEY` configurada
- `AI_PROVIDER=openai`
- `AI_REAL_ENABLED=true`

Se qualquer uma dessas condicoes faltar, o service retorna respostas estruturadas locais em `mode=mock`, sem tentativa de chamada externa.

## Ativacao futura

Para ativar OpenAI real de forma controlada, configurar no ambiente seguro do servidor:

```env
OPENAI_API_KEY=definir_no_ambiente_seguro
AI_PROVIDER=openai
AI_REAL_ENABLED=true
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TIMEOUT_MS=20000
```

A chave nao deve ser salva em arquivos do projeto, logs, respostas de API ou documentacao operacional. Apenas existir `OPENAI_API_KEY` nao ativa IA real.

## Endpoints

- `POST /api/ai/analisar-os`
- `POST /api/ai/resumo-dia`
- `POST /api/ai/gerar-laudo`
- `POST /api/ai/classificar-cobranca`
- `POST /api/ai/gerar-email`

Os endpoints recebem JSON, exigem autenticacao por sessao (`x-auth-token`), validam payload basico, aplicam limite de tamanho e retornam resposta padronizada.

Tambem existe rate limit simples em memoria:

- `PAINEL_AI_RATE_LIMIT_WINDOW_MS` padrao `60000`
- `PAINEL_AI_RATE_LIMIT_MAX` padrao `20`

## Exemplo

```bash
curl -X POST http://localhost:5000/api/ai/analisar-os ^
  -H "Content-Type: application/json" ^
  -H "x-auth-token: SEU_TOKEN" ^
  -d "{\"cliente\":\"Cliente Teste\",\"os\":\"V00000\",\"equipamento\":\"Controlador de acesso\",\"problema\":\"Equipamento nao responde\"}"
```

Para obter token, autentique em `POST /api/auth/login` com um usuario valido do painel.

## Teste autenticado via script

Use o script local sem salvar token em arquivo:

```powershell
.\scripts\test-ai-auth.ps1 -Token "COLE_TOKEN_AQUI"
```

O script chama `POST /api/ai/analisar-os` e imprime o retorno com `ConvertTo-Json -Depth 10`, preservando arrays como `result.recomendacoes`.

## Retorno JSON

As respostas da IA sao normalizadas para JSON puro. O campo `result` e sempre um objeto simples; listas como `recomendacoes`, `evidenciasNecessarias`, `estruturaLaudoSugerida.acoes` e `estruturaLaudoSugerida.pendencias` sao sempre arrays de strings:

```json
{
  "success": true,
  "mode": "mock",
  "type": "analise_os",
  "confidence": "media",
  "promptName": "analise_os",
  "result": {
    "resumo": "",
    "risco": "",
    "classificacao": "",
    "tipoLaudoSugerido": "",
    "tipoAtendimento": "",
    "decisaoOperacional": "",
    "decisaoCobranca": "",
    "recomendacoes": [
      "Validar historico da OS"
    ],
    "evidenciasNecessarias": [],
    "proximaAcao": "",
    "necessitaEscalonamento": false,
    "nivelEscalonamento": "nenhum",
    "estruturaLaudoSugerida": {
      "objetivo": "",
      "diagnostico": "",
      "acoes": [],
      "resultado": "",
      "pendencias": [],
      "conclusao": ""
    }
  },
  "timestamp": ""
}
```

No PowerShell, use sempre `ConvertTo-Json -Depth 10` para visualizar arrays aninhados corretamente.

## Botao no painel

No modulo `Operacao`, dentro do bloco `Auditoria de O.S. e proximos passos`, o botao `Reprocessar analise` e uma acao complementar: ele chama `/api/ai/analisar-os` usando o token da sessao do painel para reprocessar/visualizar detalhes. A analise principal roda automaticamente no backend ao salvar OS auditada. O resultado aparece em um bloco discreto com resumo, risco, classificacao, tipo de atendimento, tipo de laudo sugerido, decisao operacional, decisao de cobranca, escalonamento, recomendacoes, evidencias e estrutura de laudo colapsavel.

Nesta etapa a IA real ainda nao deve ser ativada; mantenha o ambiente sem `AI_REAL_ENABLED=true`.

Para validar o contrato IA v1, cenarios de cobranca e compatibilidade legada, execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-ai-operacional.ps1
```

## Fluxograma tecnico

A analise de OS aplica regras operacionais:

- causa identificada: sugerir correcao, evidencias e laudo compativel.
- causa nao identificada: nao encerrar; escalar para suporte/matriz.
- duvida antes da saida: orientar contato com matriz ou suporte responsavel.
- falta de evidencia: exigir evidencia objetiva antes de encerramento.
- sem atendimento efetivo: indicar atendimento improdutivo e pendencia de reagendamento ou validacao comercial.

## Padrao de laudo

A estrutura de laudo segue rigorosamente:

- OBJETIVO
- DIAGNOSTICO
- ACOES
- RESULTADO
- PENDENCIAS
- CONCLUSAO

O texto deve evitar linguagem vaga, conclusao sem teste e suposicoes sem evidencia. Pendencias devem indicar responsavel sempre que possivel.

## Seguranca

- Nenhuma chave e exposta.
- Nenhuma chave e salva em arquivo.
- Erros nao retornam stack trace.
- Logs registram endpoint, tipo, modo, status, timestamp, ator autenticado e tamanho do payload.
- Valores sensiveis basicos sao mascarados antes de entrar no log.
- Endpoints `/api/ai/*` exigem `requireAuth`.
- Payloads acima do limite operacional sao recusados com `AI_PAYLOAD_TOO_LARGE`.
- Operacoes acima do timeout configurado retornam `AI_TIMEOUT`.
- Falhas do provider retornam `AI_PROVIDER_ERROR` ou `AI_PROVIDER_TIMEOUT`.

## Proximos passos

- Avaliar persistencia opcional em `ia/outputs` ou em log dedicado.
- Adicionar testes automatizados para mock, auth, rate limit e provider error.
- Definir politica de custo, cotas e monitoramento antes de uso continuo em producao.
