-- Script para crear tablas del cliente web MCP
-- Ejecutar en la base de datos PRUEBA_MCP

-- Tabla de usuarios (OAuth2)
CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    oauth_provider VARCHAR(50) NOT NULL, -- 'google', 'microsoft', etc.
    oauth_id VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    picture_url VARCHAR(500),
    created_at DATETIME DEFAULT GETDATE(),
    last_login DATETIME DEFAULT GETDATE(),
    is_active BIT DEFAULT 1
);

-- Tabla de conversaciones
CREATE TABLE conversations (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL FOREIGN KEY REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    is_active BIT DEFAULT 1
);

-- Tabla de mensajes
CREATE TABLE messages (
    id INT IDENTITY(1,1) PRIMARY KEY,
    conversation_id INT NOT NULL FOREIGN KEY REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    mcp_tool_used VARCHAR(100), -- 'get_tables', 'describe_table', 'execute_query'
    sql_query TEXT, -- Query SQL ejecutada
    execution_time_ms INT, -- Tiempo de ejecución
    created_at DATETIME DEFAULT GETDATE()
);

-- Índices para mejorar rendimiento
CREATE INDEX IX_users_oauth_id ON users(oauth_id);
CREATE INDEX IX_users_email ON users(email);
CREATE INDEX IX_conversations_user_id ON conversations(user_id);
CREATE INDEX IX_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IX_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IX_messages_created_at ON messages(created_at DESC);

-- Trigger para actualizar updated_at en conversations
CREATE TRIGGER TR_conversations_updated_at
ON conversations
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE conversations 
    SET updated_at = GETDATE()
    FROM conversations c
    INNER JOIN inserted i ON c.id = i.id;
END;

-- Insertar usuario de prueba (opcional)
INSERT INTO users (oauth_provider, oauth_id, email, name, picture_url)
VALUES ('test', 'test-user-001', 'test@example.com', 'Usuario de Prueba', 'https://via.placeholder.com/150');

-- Insertar conversación de prueba
INSERT INTO conversations (user_id, title)
VALUES (1, 'Conversación de prueba');

-- Insertar mensajes de prueba
INSERT INTO messages (conversation_id, role, content, mcp_tool_used)
VALUES 
(1, 'user', '¿Qué tablas hay en la base de datos?', NULL),
(1, 'assistant', 'Aquí están las tablas disponibles en la base de datos...', 'get_tables');

PRINT 'Tablas del cliente web MCP creadas exitosamente';
