# Base Oficial do Projeto

## Diretorio oficial obrigatorio
- `C:\Painel_Operacional_Corrigido`

## Regra de governanca
- Esta e a unica base valida para leitura, alteracao, teste e validacao.
- Nao usar bases paralelas/antigas/backup como base evolutiva.
- Pastas secundarias podem existir apenas para consulta historica, nunca para evolucao funcional.

## Validacao obrigatoria de execucao
Antes e depois de qualquer rodada:
1. Chamar `GET /api/health`
2. Confirmar:
   - `rootDir = C:\Painel_Operacional_Corrigido`
   - `port = 5000`

## Blindagem de inicializacao
- O backend contem protecao para bloquear execucao fora da base oficial.
- Se iniciar em pasta errada, o processo encerra com erro explicito.
- `PAINEL_ENFORCE_OFFICIAL_ROOT=1` e o padrao obrigatorio.
- Bypass so e permitido em desenvolvimento com `PAINEL_ENFORCE_OFFICIAL_ROOT=0` + `PAINEL_ALLOW_ROOT_BYPASS=1`.
- Em operacao normal, nao usar bypass.

## Politica de revisao continua
Toda revisao deve validar:
1. funcionalidade
2. dados
3. exibicao
4. seguranca
5. nao regressao

## Segredos e ambiente
- Segredos devem ficar em `.env` ou variaveis de ambiente do sistema.
- Nunca manter senha/token/chave em arquivos texto em `data/` ou documentacao.
- Modelo seguro: `.env.example`.
