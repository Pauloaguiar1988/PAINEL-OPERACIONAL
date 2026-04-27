USE [master];
GO

DECLARE @DatabaseName sysname = N'DMPACESSO';
DECLARE @LoginName sysname = N'lider_tecnico_tagus';
DECLARE @Password nvarchar(128) = N'TroquePorSenhaForte#2026';
DECLARE @PasswordEscaped nvarchar(256) = REPLACE(@Password, '''', '''''');
DECLARE @sql nvarchar(max);

IF DB_ID(@DatabaseName) IS NULL
BEGIN
  THROW 50000, 'Base DMPACESSO nao encontrada.', 1;
END;

IF SUSER_ID(@LoginName) IS NULL
  SET @sql = N'CREATE LOGIN ' + QUOTENAME(@LoginName) + N' WITH PASSWORD = N''' + @PasswordEscaped + N''', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;';
ELSE
  SET @sql = N'ALTER LOGIN ' + QUOTENAME(@LoginName) + N' WITH PASSWORD = N''' + @PasswordEscaped + N''', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;';
EXEC (@sql);

SET @sql = N'
USE ' + QUOTENAME(@DatabaseName) + N';
IF USER_ID(N''' + REPLACE(@LoginName, '''', '''''') + N''') IS NULL
  CREATE USER ' + QUOTENAME(@LoginName) + N' FOR LOGIN ' + QUOTENAME(@LoginName) + N';
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

SELECT
  @LoginName AS login_name,
  CAST(IS_SRVROLEMEMBER('sysadmin', @LoginName) AS int) AS is_sysadmin;

