-- Script para crear usuario de prueba en la base de datos
-- Ejecuta este script ANTES de iniciar el backend

USE [PRUEBA_MCP]
GO

-- 1. Crear usuario de prueba si no existe
IF NOT EXISTS (SELECT 1 FROM users WHERE id = 1)
BEGIN
    INSERT INTO users (id, oauth_provider, oauth_id, email, name, picture_url, created_at, last_login, is_active)
    VALUES (
        1,
        'TEST',
        'test_user',
        'test@efc.com.pe',
        'Usuario de Prueba',
        NULL,
        GETDATE(),
        GETDATE(),
        1
    );
    
    PRINT '✅ Usuario de prueba creado (ID: 1)';
END
ELSE
BEGIN
    PRINT 'ℹ️ Usuario de prueba ya existe (ID: 1)';
END
GO

-- 2. Verificar que el usuario existe
SELECT 
    id,
    oauth_provider,
    name,
    email,
    created_at,
    is_active
FROM users 
WHERE id = 1;
GO

