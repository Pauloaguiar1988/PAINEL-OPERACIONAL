# Passo a Passo - Liberar envio de e-mail (Microsoft 365)

Status atual validado no painel:
- O sistema esta funcionando.
- Login dos usuarios esta ok.
- Reset de senha funciona em modo local (outbox).
- Envio SMTP real falha com: `535 5.7.3 Authentication unsuccessful`.

## O que esse erro significa
As credenciais existem, mas o Microsoft 365 esta bloqueando autenticacao SMTP (ou requer senha de aplicativo).

## Ajuste recomendado (admin M365)
1. No Exchange Admin Center, habilite SMTP AUTH para a caixa usada no painel.
2. Verifique no tenant se SMTP AUTH nao esta bloqueado globalmente.
3. Se a conta usa MFA, gere **senha de aplicativo** e use essa senha no painel.
4. Use esta configuracao no painel:
   - Host: `smtp.office365.com`
   - Porta: `587`
   - Secure: `false` (STARTTLS)
   - Usuario: e-mail completo da conta
   - From: mesmo e-mail (ou remetente permitido)

## Como testar no proprio painel
1. Entrar com `admin_campinas`.
2. Ir em: `Historico > Mais opcoes > Usuarios e e-mail`.
3. Preencher SMTP e clicar em `Salvar SMTP`.
4. Clicar em `Testar envio`.
5. Se `Testar envio` retornar sucesso, o `Esqueci senha` passa a enviar e-mail real.

## Validacao rapida
- Com SMTP desabilitado: reset vai para `data\\password-reset-outbox.json`.
- Com SMTP habilitado e ok: reset vai para o e-mail do usuario.
