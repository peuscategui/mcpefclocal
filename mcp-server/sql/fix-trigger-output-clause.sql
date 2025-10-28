-- ============================================
-- Script: Fix Trigger para compatibilidad con OUTPUT
-- Problema: El trigger actual no permite usar OUTPUT en INSERT
-- Solución: Modificar el trigger para que NO actualice durante INSERT
-- ============================================

USE [PRUEBA_MCP]
GO

-- Eliminar el trigger actual
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'TR_prompts_only_one_active')
BEGIN
    DROP TRIGGER TR_prompts_only_one_active
    PRINT '✅ Trigger anterior eliminado'
END
GO

-- Crear nuevo trigger que solo actúa en UPDATE (no en INSERT)
CREATE TRIGGER TR_prompts_only_one_active
ON prompts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Solo desactivar otros prompts cuando se ACTUALIZA uno para activarlo
    -- No hacemos nada en INSERT para permitir OUTPUT
    IF EXISTS (SELECT 1 FROM inserted WHERE is_active = 1)
    BEGIN
        UPDATE prompts
        SET is_active = 0
        WHERE prompt_type_id IN (SELECT prompt_type_id FROM inserted WHERE is_active = 1)
          AND ISNULL(user_profile_id, -1) = ISNULL((SELECT user_profile_id FROM inserted WHERE is_active = 1), -1)
          AND id NOT IN (SELECT id FROM inserted WHERE is_active = 1);
        
        PRINT '✅ Otros prompts del mismo tipo+perfil desactivados'
    END
END
GO

PRINT ''
PRINT '✅ Trigger actualizado exitosamente'
PRINT 'ℹ️ Ahora puedes crear prompts sin errores'
GO

