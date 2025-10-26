-- Script para ver el historial de conversaciones

USE [PRUEBA_MCP]
GO

-- 1. Ver todas las conversaciones
SELECT 
    id,
    user_id,
    title,
    created_at,
    updated_at,
    is_active
FROM conversations
ORDER BY updated_at DESC;
GO

-- 2. Ver mensajes de una conversación específica
DECLARE @ConversationId INT = 1; -- Cambia este ID

SELECT 
    m.id,
    m.role,
    m.content,
    m.mcp_tool_used,
    m.execution_time_ms,
    m.created_at
FROM messages m
WHERE m.conversation_id = @ConversationId
ORDER BY m.created_at ASC;
GO

-- 3. Ver todas las conversaciones con su conteo de mensajes
SELECT 
    c.id,
    c.title,
    c.created_at,
    c.updated_at,
    COUNT(m.id) as total_mensajes,
    MAX(m.created_at) as ultimo_mensaje
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversation_id
WHERE c.is_active = 1
GROUP BY c.id, c.title, c.created_at, c.updated_at
ORDER BY c.updated_at DESC;
GO

