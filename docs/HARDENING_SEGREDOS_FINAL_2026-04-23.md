# Hardening de Segredos - Rodada Final (2026-04-23)

## Escopo
- Base oficial: `C:\Painel_Operacional_Corrigido`
- Objetivo: remover exposicao de segredos em texto, migrar para ambiente e manter operacao sem regressao.

## Classificacao das ocorrencias

### Segredo real ativo (tratado)
- `server.js` (senhas bootstrap hardcoded): migrado para `PAINEL_BOOTSTRAP_ADMIN_PASSWORD` e `PAINEL_BOOTSTRAP_TECH_PASSWORD`.
- `server.js` (fallback SQL por arquivo): migrado para `SQL_SERVER`, `SQL_DATABASE`, `SQL_USER`, `SQL_PASSWORD`; fallback legado agora exige `PAINEL_ALLOW_LEGACY_SQL_CREDENTIAL_FILE=1`.
- `data/password-reset-outbox.json`: limpo para `[]` apos backup.

### Legado sensivel (sanitizado)
- `data/credencial_sql_dmpacesso.txt`
- `data/credencial_sql_sa.txt`
- `data/credencial_sql_lider_tecnico.txt`
- `data/credencial_painel_perfis.txt`
- `data/credencial_lider_campinas_rede.txt`
- `data/CREDENCIAIS_TESTE_REDE.txt`
- `data/PASSO_A_PASSO_LIBERACAO_INTRANE_E_TESTE.txt`
- `data/PASSO_A_PASSO_LIDER_TECNICO_REDE.txt`
- `README_COMO_USAR.txt` (trechos com senha real)

### Mock seguro
- `sql/criar_usuarios_dmpacesso.sql` e `sql/criar_lider_tecnico_tagus.sql` usam placeholder (`TroquePorSenhaForte#2026`), sem segredo operacional real.

### Falso positivo
- Tokens de sessao no codigo frontend/backend como referencia de chave/campo (sem segredo fixo hardcoded).
- Labels de UI com palavra "senha" sem valor secreto.

## Arquivos de apoio adicionados/atualizados
- `.env.example` (modelo seguro e obrigatorios de ambiente)
- `.env.exemplo.txt` (aponta para o novo modelo)
- `.gitignore` (bloqueio de commit de segredo e artefatos sensiveis)
- `BASE_OFICIAL.md` (politica de segredo e bypass de raiz oficial)
- `docs/CHECKLIST_REVISAO_OBRIGATORIA.md` (inclui smoke E2E obrigatorio)

## Politica de blindagem de base oficial
- `PAINEL_ENFORCE_OFFICIAL_ROOT=1` por padrao.
- Bypass permitido apenas em desenvolvimento com:
  - `PAINEL_ENFORCE_OFFICIAL_ROOT=0`
  - `PAINEL_ALLOW_ROOT_BYPASS=1`
- Sem as duas condicoes, o bypass e bloqueado.
