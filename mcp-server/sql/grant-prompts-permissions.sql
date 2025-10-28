-- ============================================
-- Script: Otorgar permisos al usuario MCP
-- Base de datos: PRUEBA_MCP
-- Descripción: Permisos necesarios para crear y gestionar tablas de prompts
-- ⚠️ EJECUTAR CON USUARIO 'sa' O UN ADMINISTRADOR
-- ============================================

USE [PRUEBA_MCP]
GO

PRINT '🔒 Otorgando permisos al usuario MCP...'
GO

-- Permisos para crear objetos
GRANT CREATE TABLE TO [MCP]
GO
PRINT '✅ Permiso CREATE TABLE otorgado'
GO

-- Permisos sobre el esquema dbo
GRANT ALTER ON SCHEMA::dbo TO [MCP]
GO
PRINT '✅ Permiso ALTER SCHEMA otorgado'
GO

-- Si ya existen las tablas, otorgar permisos específicos
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[user_profiles]') AND type in (N'U'))
BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON [dbo].[user_profiles] TO [MCP]
    PRINT '✅ Permisos en user_profiles otorgados'
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[prompt_types]') AND type in (N'U'))
BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON [dbo].[prompt_types] TO [MCP]
    PRINT '✅ Permisos en prompt_types otorgados'
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[prompts]') AND type in (N'U'))
BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON [dbo].[prompts] TO [MCP]
    PRINT '✅ Permisos en prompts otorgados'
END
GO

-- Verificar permisos otorgados
PRINT ''
PRINT '🔍 Permisos actuales del usuario MCP:'
GO

SELECT 
    dp.name AS usuario,
    dp.type_desc AS tipo_usuario,
    ISNULL(o.name, 'SCHEMA: ' + p.class_desc) AS objeto,
    p.permission_name AS permiso,
    p.state_desc AS estado
FROM sys.database_permissions AS p
INNER JOIN sys.database_principals AS dp ON p.grantee_principal_id = dp.principal_id
LEFT JOIN sys.objects AS o ON p.major_id = o.object_id
WHERE dp.name = 'MCP'
ORDER BY objeto, permiso
GO

PRINT ''
PRINT '✅ Permisos otorgados exitosamente'
PRINT ''
PRINT '💡 Ahora puedes ejecutar: node execute-prompts-setup.js'
GO

