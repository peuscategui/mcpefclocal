USE [PRUEBA_MCP]
GO

-- Verificar si la tabla users existe
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[users]') AND type in (N'U'))
BEGIN
    PRINT '⚠️ La tabla users no existe. Creándola...'
    
    CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NULL,
        profile VARCHAR(50) DEFAULT 'analista',
        is_active BIT DEFAULT 1,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    
    PRINT '✅ Tabla users creada'
END
ELSE
BEGIN
    PRINT 'ℹ️ La tabla users ya existe'
END
GO

-- Insertar usuario administrador de prueba si no existe
IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin')
BEGIN
    INSERT INTO users (username, name, email, profile, is_active)
    VALUES ('admin', 'Administrador del Sistema', 'admin@efc.com.pe', 'admin', 1);
    
    PRINT '✅ Usuario administrador creado (ID: 1)'
END
ELSE
BEGIN
    PRINT 'ℹ️ Usuario admin ya existe'
END
GO

-- Insertar usuario jefe de GI de prueba si no existe
IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'jefe_gi')
BEGIN
    INSERT INTO users (username, name, email, profile, is_active)
    VALUES ('jefe_gi', 'Jefe de GI', 'jefegi@efc.com.pe', 'jefe_gi', 1);
    
    PRINT '✅ Usuario jefe_gi creado (ID: 2)'
END
ELSE
BEGIN
    PRINT 'ℹ️ Usuario jefe_gi ya existe'
END
GO

-- Insertar usuario analista de prueba si no existe
IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'analista')
BEGIN
    INSERT INTO users (username, name, email, profile, is_active)
    VALUES ('analista', 'Analista Comercial', 'analista@efc.com.pe', 'analista', 1);
    
    PRINT '✅ Usuario analista creado (ID: 3)'
END
ELSE
BEGIN
    PRINT 'ℹ️ Usuario analista ya existe'
END
GO

-- Mostrar usuarios creados
SELECT id, username, name, email, profile, is_active, created_at
FROM users
ORDER BY id;
GO

PRINT ''
PRINT '✅ Script completado. Usuarios disponibles para usar en created_by'
GO

