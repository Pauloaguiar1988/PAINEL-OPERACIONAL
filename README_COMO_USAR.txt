PAINEL GESTAO OPERACIONAL - ENTREGA PRONTA

PASTA OFICIAL DE USO
- C:\Painel_Operacional_Corrigido

ABERTURA DO PAINEL (MODO PRATICO)
1. Clique duas vezes em:
- iniciar_painel_v8_3.bat
2. Abra no navegador:
- http://localhost:5000

Se quiser sem qualquer janela de CMD:
- abrir_painel_sem_cmd.vbs
- O watchdog de estabilidade inicia junto e monitora o servidor automaticamente.

IMPORTANTE
- Nao abrir index.html direto (file://).
- Sempre usar http://localhost:5000.

DADOS (SALVAMENTO COMPARTILHADO)
- Base principal: data\records.json
- Backup automatico: data\backups\latest-records-backup.json
- Snapshots periodicos: data\backups\records-snapshot-YYYYMMDD_HHMMSS.json
- Estado do servidor: data\runtime.json
- Trilha de auditoria local (fallback): data\audit-log.json
- Logs rotativos do servidor/API: data\logs\server.log e data\logs\access.log
- Monitoramento watchdog: data\monitor.log e data\monitor.pid
- Pasta de importacao automatica (Campinas):
  data\import\campinas
- Configuracao de precos:
  data\pricing-config.json
- Catalogo de codigos/precos importado da tabela:
  data\pricing-catalog.json
- Configuracao SMTP persistida:
  data\smtp-config.json
- Controle de tentativas de login:
  data\login-attempts.json

MODO DE ARMAZENAMENTO
- O servidor agora tenta usar SQL automaticamente (PAINEL_STORAGE=auto).
- Se SQL estiver disponivel, grava no banco DMPACESSO e mantem espelho em records.json.
- Se SQL falhar, entra em fallback JSON sem derrubar o painel.

CONSULTAR A PASTA DE DADOS
- abrir_pasta_dados.vbs
- abrir_pasta_importacao.vbs

IMPORTACAO AUTOMATICA EXCEL (CAMPINAS)
1. Exportar ou montar o arquivo Excel/CSV.
2. Copiar o arquivo para:
   data\import\campinas
3. O servidor monitora a pasta continuamente e importa sozinho (watch + varredura periodica).
4. A atualizacao entra na base compartilhada e sincroniza para os navegadores em tempo real.

OBSERVACOES DA IMPORTACAO
- Formatos aceitos: .xlsx, .xls, .csv, .pdf
- O sistema considera o arquivo mais recente da pasta.
- Se existir linha da data de hoje no arquivo, ela tem prioridade.
- Se nao existir data de hoje, usa a ultima linha valida do arquivo.
- Exemplo de colunas aceitas:
  Data Operacao, Casos Criticos, Reincidencias, SLA, Execucao, Cliente mais critico, Acao Feita, Prazo, Status Operacao
- Exemplo para planilha de O.S. por linha:
  Data Operacao, Numero OS, Cliente, Prioridade, Status OS, Prazo, SLA OS, Execucao, Reincidente, Acao Feita
- Colunas adicionais recomendadas para sua realidade:
  Tipo Atendimento, Classificacao de Atendimento, Contrato Ativo/Inativo, Classificacao (Garantia), Descricao do Produto, Sigla Atendimento
- Ao importar O.S. (Excel ou PDF), o cockpit calcula automaticamente:
  mix de atendimento (Instalacao/Corretiva/Preventiva), cobertura (Garantia/Contrato/Avulso) e produto com mais incidencia
- Auditoria automatica de O.S.:
  risco de nao faturar, falta de codigo, laudo sem clareza e divergencia de contrato/garantia com proximo passo por O.S.
- Modelo de referencia (nao monitorado):
  data\import\modelos\MODELO_IMPORTACAO_CAMPINAS.csv
  data\import\modelos\MODELO_OS_LINHAS_CAMPINAS.csv
  data\import\modelos\ANALISE_OS_EXEMPLO_EXTRAIDA.csv

TABELA DE PRECOS (FINANCEIRO)
- Configuracao de precos Campinas (3 valores):
  deslocamento, primeira hora, adicional de 30 min
- Link de referencia Looker:
  https://lookerstudio.google.com/u/0/reporting/ae9776d6-6257-43f0-a2a8-3661eb392f33/page/JySjD
- Portal do cliente integrado no cockpit:
  https://portal-do-cliente-c7ec1b8e.base44.app/teves
- BI operacional integrado no cockpit:
  https://app.powerbi.com/groups/me/reports/c6f1f21b-6ce3-4489-87d6-2e80f06938e2/ReportSectiondafaea5d868ed5733b2e?experience=power-bi
- Endpoints:
  GET  /api/pricing/config
  POST /api/pricing/config
  POST /api/pricing/import-table
- Auditoria detalhada por data:
  GET /api/os-audit/{data}

COMPARTILHAR NA REDE
1. Manter este computador ligado com o servidor aberto.
2. No painel, abrir "Consultar base compartilhada".
3. Copiar o link de rede mostrado em "Acesso para outros usuarios".
4. Outros usuarios da mesma rede acessam esse link e veem os mesmos dados.

LIBERACAO AUTOMATICA PARA TESTE DE INTRANET
- Executar como administrador:
  C:\Painel_Operacional_Corrigido\liberar_intranet_teste_admin.bat
- Pacote pronto (script + credenciais + passo a passo):
  C:\Painel_Operacional_Corrigido\data\PACOTE_LIBERACAO_INTRANE_TESTE.zip

DIAGNOSTICO TECNICO
- iniciar_painel.bat (abre com logs)
- encerrar_painel_sem_cmd.vbs (fecha servidor em segundo plano)

SQL - USUARIOS E ACESSO
- Script de criacao de usuario:
  sql\criar_usuarios_dmpacesso.sql
- Script dedicado para perfil lider tecnico SQL:
  sql\criar_lider_tecnico_tagus.sql
- Script de reset da base:
  sql\reset_dmpacesso.sql
- Credenciais operacionais:
  configurar via arquivo .env (modelo em .env.example)
  SQL_SERVER, SQL_DATABASE, SQL_USER, SQL_PASSWORD
- Fallback legado por arquivo de credencial:
  desativado por padrao (habilite apenas de forma temporaria com PAINEL_ALLOW_LEGACY_SQL_CREDENTIAL_FILE=1)

ACESSO AO PAINEL (PERFIL)
- Usuario admin padrao:
  usuario: admin_campinas
  senha: definida no ambiente (PAINEL_BOOTSTRAP_ADMIN_PASSWORD) ou gerenciada pelo admin
- Usuario lider tecnico padrao:
  usuario: lider_tecnico
  senha: definida no ambiente (PAINEL_BOOTSTRAP_TECH_PASSWORD) ou gerenciada pelo admin
- Usuario lider tecnico para teste em rede:
  usuario: lider_campinas_rede
  senha: definir/resetar via tela de Gestao de Usuarios
- Arquivo com esses acessos:
  data\credencial_painel_perfis.txt
  data\credencial_lider_campinas_rede.txt

LOGIN PROFISSIONAL (NOVO)
- Tela de acesso com idioma PT-BR / EN.
- Opcao "Salvar acesso neste navegador" (remember browser).
- Sessao expira apos 1 hora de inatividade real do usuario.
- Bloqueio temporario por tentativas de login incorretas (anti-forca-bruta).
- Politica de senha forte aplicada no reset e na criacao de usuarios.
- Recuperacao de senha:
  - Solicitar codigo: POST /api/auth/forgot-password
  - Redefinir senha: POST /api/auth/reset-password
- Arquivos de controle da recuperacao:
  data\password-reset-requests.json
  data\password-reset-outbox.json

EMAIL PARA RECUPERAR SENHA (SMTP)
- Para envio real por e-mail, pode configurar por variavel de ambiente OU via API admin:
  PAINEL_SMTP_HOST
  PAINEL_SMTP_PORT
  PAINEL_SMTP_SECURE (true/false)
  PAINEL_SMTP_USER
  PAINEL_SMTP_PASS
  PAINEL_SMTP_FROM
- Endpoints SMTP (admin):
  GET  /api/admin/smtp-config
  POST /api/admin/smtp-config
  POST /api/admin/smtp-test
- Sem SMTP, o sistema entra em modo teste e grava o codigo no outbox local.

PERMISSOES DO LIDER TECNICO
- Menus liberados:
  Painel, Operacao, Agenda, Lider Tecnico, Diagnostico Consolidado e Historico
- Menus bloqueados:
  Administrativo, Resultado do Dia, Executivo, Negocio e Melhorias
- Restricao no servidor:
  mesmo que tentem enviar dados bloqueados, o backend preserva os campos administrativos/executivos.

TRILHA DE AUDITORIA
- Menu Historico agora mostra "Trilha de auditoria da data".
- Registra: usuario, horario e resumo das alteracoes.
- Endpoint tecnico: GET /api/audit/{data}

COCKPIT INTELIGENTE (NIVEL GESTAO)
- No Painel do Dia existe o bloco "Cockpit Inteligente Tagus-Tec Campinas".
- Mostra score operacional, nivel de risco, alerta principal e plano de acao 24h.
- Dados vindo do backend SQL via endpoint: GET /api/insights/{data}
- Qualidade operacional automatica por data:
  GET /api/quality/{data}
- O backend emite eventos em tempo real de registro e qualidade para os navegadores conectados.

GESTAO DE USUARIOS DO PAINEL (ADMIN)
- Listar usuarios: GET /api/users
- Criar/atualizar usuario: POST /api/users
- Requer login admin e token de sessao.

SEGURANCA E POLITICAS (ADMIN)
- Politica atual de senha/login: GET /api/security/policy
- O bloqueio de login e limpo automaticamente quando o admin redefine senha do usuario.

REQUISITO
- Node.js instalado no computador servidor.
