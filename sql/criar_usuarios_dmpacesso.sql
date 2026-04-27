/*
  Script: criar_usuarios_dmpacesso.sql
  Objetivo: criar/atualizar login SQL e usuario na base DMPACESSO.
  Uso:
    1) Edite os valores das variaveis abaixo.
    2) Execute no SQL Server (SSMS ou sqlcmd).
*/

USE [master];
GO

DECLARE @DatabaseName sysname = N'DMPACESSO';
DECLARE @LoginName sysname = N'dmpacesso_app_novo';
DECLARE @Password nvarchar(128) = N'TroquePorSenhaForte#2026';
DECLARE @GrantFullAccess bit = 0; -- 0 = acesso de aplicacao (db_datareader/db_datawriter), 1 = full access (sysadmin)

IF DB_ID(@DatabaseName) IS NULL
BEGIN
  THROW 50000, 'Base DMPACESSO nao encontrada.', 1;
END;

DECLARE @sql nvarchar(max);
DECLARE @PasswordEscaped nvarchar(256) = REPLACE(@Password, '''', '''''');

IF SUSER_ID(@LoginName) IS NULL
BEGIN
  SET @sql = N'CREATE LOGIN ' + QUOTENAME(@LoginName) +
             N' WITH PASSWORD = N''' + @PasswordEscaped +
             N''', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;';
END
ELSE
BEGIN
  SET @sql = N'ALTER LOGIN ' + QUOTENAME(@LoginName) +
             N' WITH PASSWORD = N''' + @PasswordEscaped +
             N''', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;';
END;
EXEC (@sql);

SET @sql = N'
USE ' + QUOTENAME(@DatabaseName) + N';
IF USER_ID(N''' + REPLACE(@LoginName, '''', '''''') + N''') IS NULL
  CREATE USER ' + QUOTENAME(@LoginName) + N' FOR LOGIN ' + QUOTENAME(@LoginName) + N';
';
EXEC (@sql);

SET @sql = N'
USE ' + QUOTENAME(@DatabaseName) + N';
IF NOT EXISTS (
  SELECT 1
  FROM sys.database_role_members rm
  JOIN sys.database_principals r ON rm.role_principal_id = r.principal_id
  JOIN sys.database_principals m ON rm.member_principal_id = m.principal_id
  WHERE r.name = ''db_datareader'' AND m.name = N''' + REPLACE(@LoginName, '''', '''''') + N'''
)
  ALTER ROLE [db_datareader] ADD MEMBER ' + QUOTENAME(@LoginName) + N';

IF NOT EXISTS (
  SELECT 1
  FROM sys.database_role_members rm
  JOIN sys.database_principals r ON rm.role_principal_id = r.principal_id
  JOIN sys.database_principals m ON rm.member_principal_id = m.principal_id
  WHERE r.name = ''db_datawriter'' AND m.name = N''' + REPLACE(@LoginName, '''', '''''') + N'''
)
  ALTER ROLE [db_datawriter] ADD MEMBER ' + QUOTENAME(@LoginName) + N';
';
EXEC (@sql);

IF @GrantFullAccess = 1
BEGIN
  SET @sql = N'
  IF IS_SRVROLEMEMBER(''sysadmin'', N''' + REPLACE(@LoginName, '''', '''''') + N''') <> 1
    ALTER SERVER ROLE [sysadmin] ADD MEMBER ' + QUOTENAME(@LoginName) + N';
  ';
  EXEC (@sql);
END;

SELECT
  @LoginName AS login_name,
  @DatabaseName AS database_name,
  CAST(IS_SRVROLEMEMBER('sysadmin', @LoginName) AS int) AS is_sysadmin;

