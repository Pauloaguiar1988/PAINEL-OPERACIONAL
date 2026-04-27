# Checklist Obrigatoria de Revisao (Base Principal)

Aplicar este checklist em toda revisao tecnica, sem excecao, antes de concluir qualquer entrega.

## 1) Funcionalidade
- Login e sessao ativa.
- Save/load por data.
- Troca de data com e sem base.
- Painel do dia, Operacao Interna, Analise Externa/Laudo e Executivo Trimestral.
- Workflow da reviewQueue (leitura + acoes por perfil, quando aplicavel).
- Exports mensal e trimestral + status/jobs.

## 2) Integridade de dados
- Confirmar que payload backend chega completo para cada bloco.
- Confirmar que `exists=false` nao reaproveita estado antigo.
- Confirmar que diario usa data selecionada e mensal usa o mes da data selecionada.
- Confirmar que dados importados e consolidados nao somem entre recargas.

## 3) Exibicao
- Todo dado existente no payload deve aparecer na UI correspondente.
- Fallbacks so podem aparecer quando nao houver base real.
- Alertas, tendencias e narrativas nao podem ser sobrescritos por texto generico se houver informacao backend.
- Responsividade minima: desktop, notebook, tablet e celular.

## 4) Seguranca
- Sem segredo em texto claro no repositorio.
- Credenciais somente via variaveis de ambiente.
- Logs e erros sem exposicao de token/senha/stack sensivel para usuario final.
- Validar RBAC no backend (nao depender apenas do frontend).

## 5) Nao regressao
- Validar fluxo completo apos cada patch: save -> reload -> dashboard -> historico -> auditoria.
- Validar endpoints criticos: health, insights, review workflow, exports.
- Validar camada historica quando ativa: `GET /api/analytics/historical/status`, `POST /api/analytics/historical/import` e presenca de `historicalIntelligence` em `/api/insights/:date`.
- Executar smoke E2E minimo: `npm run test:smoke`.
- Registrar explicitamente:
  - o que foi validado em execucao real,
  - o que foi validado por inspecao,
  - o que nao foi validado e por que.

## Regra de base
- Base oficial de evolucao: `C:\Painel_Operacional_Corrigido`.
- Base secundaria `painel_v8_2_fix` nao deve receber evolucao de produto.
- Validar `GET /api/health` antes e depois de cada rodada e confirmar `rootDir` da base oficial.
