-- ============================================
-- Script: Otorgar permiso REFERENCES al usuario MCP
-- ⚠️ EJECUTAR CON USUARIO 'sa' O UN ADMINISTRADOR
-- ============================================

USE [PRUEBA_MCP]
GO

-- Permiso para crear foreign keys
GRANT REFERENCES ON SCHEMA::dbo TO [MCP]
GO

PRINT '✅ Permiso REFERENCES otorgado al usuario MCP'
PRINT 'Ahora puede crear foreign keys y constraints'
GO

