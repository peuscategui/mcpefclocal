-- ============================================
-- Script para crear usuarios de producción
-- Base de datos: PRUEBA_MCP
-- ============================================

USE [PRUEBA_MCP]
GO

PRINT '🚀 Creando usuarios de producción...'
GO

-- ============================================
-- 1. USUARIO ADMINISTRADOR
-- ============================================
IF NOT EXISTS (SELECT 1 FROM users WHERE id = 1)
BEGIN
    INSERT INTO users (
        id, 
        oauth_provider, 
        oauth_id, 
        email, 
        name, 
        picture_url, 
        created_at, 
        last_login, 
        is_active,
        role
    )
    VALUES (
        1,
        'LOCAL',
        'admin',
        'admin@efc.com.pe',
        'Administrador',
        NULL,
        GETDATE(),
        GETDATE(),
        1,
        'admin'
    );
    
    PRINT '✅ Usuario Administrador creado (ID: 1)';
END
ELSE
BEGIN
    PRINT 'ℹ️  Usuario Administrador ya existe (ID: 1)';
    
    -- Actualizar datos si ya existe
    UPDATE users 
    SET 
        email = 'admin@efc.com.pe',
        name = 'Administrador',
        oauth_provider = 'LOCAL',
        oauth_id = 'admin',
        is_active = 1
    WHERE id = 1;
    
    PRINT '✅ Datos del Administrador actualizados';
END
GO

-- ============================================
-- 2. USUARIO CÁCERES
-- ============================================
IF NOT EXISTS (SELECT 1 FROM users WHERE id = 2)
BEGIN
    INSERT INTO users (
        id, 
        oauth_provider, 
        oauth_id, 
        email, 
        name, 
        picture_url, 
        created_at, 
        last_login, 
        is_active,
        role
    )
    VALUES (
        2,
        'LOCAL',
        'caceres',
        'caceres@efc.com.pe',
        'Cáceres',
        NULL,
        GETDATE(),
        GETDATE(),
        1,
        'user'
    );
    
    PRINT '✅ Usuario Cáceres creado (ID: 2)';
END
ELSE
BEGIN
    PRINT 'ℹ️  Usuario Cáceres ya existe (ID: 2)';
    
    -- Actualizar datos si ya existe
    UPDATE users 
    SET 
        email = 'caceres@efc.com.pe',
        name = 'Cáceres',
        oauth_provider = 'LOCAL',
        oauth_id = 'caceres',
        is_active = 1
    WHERE id = 2;
    
    PRINT '✅ Datos de Cáceres actualizados';
END
GO

-- ============================================
-- 3. VERIFICAR USUARIOS CREADOS
-- ============================================
PRINT ''
PRINT '📋 USUARIOS EN EL SISTEMA:'
PRINT '========================'

SELECT 
    id,
    name,
    email,
    oauth_provider,
    is_active,
    role,
    created_at
FROM users 
WHERE is_active = 1
ORDER BY id;
GO

PRINT ''
PRINT '✅ Script completado exitosamente'
GO

