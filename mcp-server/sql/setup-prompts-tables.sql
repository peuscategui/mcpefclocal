-- ============================================
-- Script: Setup Prompts Administration Tables
-- Base de datos: PRUEBA_MCP
-- Descripción: Tablas para administración de prompts por perfil de usuario
-- ============================================

USE [PRUEBA_MCP]
GO

-- ============================================
-- 1. Tabla de perfiles de usuario
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[user_profiles]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[user_profiles] (
        id INT IDENTITY(1,1) PRIMARY KEY,
        profile_name VARCHAR(50) NOT NULL UNIQUE,
        description VARCHAR(255),
        created_at DATETIME DEFAULT GETDATE()
    );
    PRINT '✅ Tabla user_profiles creada';
END
ELSE
BEGIN
    PRINT 'ℹ️ Tabla user_profiles ya existe';
END
GO

-- ============================================
-- 2. Tabla de tipos de prompt
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[prompt_types]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[prompt_types] (
        id INT IDENTITY(1,1) PRIMARY KEY,
        type_name VARCHAR(50) NOT NULL UNIQUE,
        description VARCHAR(255),
        created_at DATETIME DEFAULT GETDATE()
    );
    PRINT '✅ Tabla prompt_types creada';
END
ELSE
BEGIN
    PRINT 'ℹ️ Tabla prompt_types ya existe';
END
GO

-- ============================================
-- 3. Tabla principal de prompts
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[prompts]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[prompts] (
        id INT IDENTITY(1,1) PRIMARY KEY,
        prompt_type_id INT NOT NULL FOREIGN KEY REFERENCES prompt_types(id),
        user_profile_id INT NULL FOREIGN KEY REFERENCES user_profiles(id),
        name VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        version INT NOT NULL DEFAULT 1,
        is_active BIT DEFAULT 0,
        created_by INT NULL FOREIGN KEY REFERENCES users(id),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    PRINT '✅ Tabla prompts creada';
END
ELSE
BEGIN
    PRINT 'ℹ️ Tabla prompts ya existe';
END
GO

-- ============================================
-- 4. Índices para optimización
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_prompts_type_profile' AND object_id = OBJECT_ID('prompts'))
BEGIN
    CREATE INDEX IX_prompts_type_profile ON prompts(prompt_type_id, user_profile_id, is_active);
    PRINT '✅ Índice IX_prompts_type_profile creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_prompts_version' AND object_id = OBJECT_ID('prompts'))
BEGIN
    CREATE INDEX IX_prompts_version ON prompts(prompt_type_id, version DESC);
    PRINT '✅ Índice IX_prompts_version creado';
END
GO

-- ============================================
-- 5. Trigger: Solo 1 prompt activo por tipo+perfil
-- ============================================
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'TR_prompts_only_one_active')
BEGIN
    DROP TRIGGER TR_prompts_only_one_active;
    PRINT 'ℹ️ Trigger TR_prompts_only_one_active eliminado para recrear';
END
GO

CREATE TRIGGER TR_prompts_only_one_active
ON prompts
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Desactivar otros prompts del mismo tipo+perfil cuando se activa uno nuevo
    UPDATE prompts
    SET is_active = 0
    WHERE prompt_type_id IN (SELECT prompt_type_id FROM inserted WHERE is_active = 1)
      AND ISNULL(user_profile_id, -1) = ISNULL((SELECT user_profile_id FROM inserted WHERE is_active = 1), -1)
      AND id NOT IN (SELECT id FROM inserted WHERE is_active = 1);
END
GO
PRINT '✅ Trigger TR_prompts_only_one_active creado';
GO

-- ============================================
-- 6. Datos iniciales - Perfiles
-- ============================================
IF NOT EXISTS (SELECT * FROM user_profiles WHERE profile_name = 'admin')
BEGIN
    INSERT INTO user_profiles (profile_name, description) VALUES
    ('admin', 'Administrador del sistema'),
    ('jefe_gi', 'Jefe de GI - puede adaptar prompts'),
    ('analista', 'Analista comercial'),
    ('gerente', 'Gerente de área');
    PRINT '✅ Perfiles de usuario insertados';
END
ELSE
BEGIN
    PRINT 'ℹ️ Perfiles de usuario ya existen';
END
GO

-- ============================================
-- 7. Datos iniciales - Tipos de prompt
-- ============================================
IF NOT EXISTS (SELECT * FROM prompt_types WHERE type_name = 'analysis')
BEGIN
    INSERT INTO prompt_types (type_name, description) VALUES
    ('analysis', 'Prompt para análisis comercial con OpenAI'),
    ('sql_generation', 'Prompt para generación de SQL (futuro)');
    PRINT '✅ Tipos de prompt insertados';
END
ELSE
BEGIN
    PRINT 'ℹ️ Tipos de prompt ya existen';
END
GO

-- ============================================
-- 8. Datos iniciales - Prompt actual como versión 1
-- ============================================
IF NOT EXISTS (SELECT * FROM prompts WHERE version = 1 AND is_active = 1)
BEGIN
    DECLARE @prompt_type_id INT;
    SELECT @prompt_type_id = id FROM prompt_types WHERE type_name = 'analysis';
    
    INSERT INTO prompts (prompt_type_id, user_profile_id, name, content, version, is_active)
    VALUES (
        @prompt_type_id,
        NULL,
        'Prompt de Análisis Comercial v1',
        'Eres un analista comercial senior con más de 50 años de experiencia acumulada en sectores estratégicos como minería, energía, agroindustria, industria y construcción.

Tu misión es analizar operaciones comerciales históricas, identificar patrones de rendimiento, generar alertas estratégicas y emitir recomendaciones accionables de alto impacto para el comité directivo.

La evaluación se deberá tomar en base a la rentabilidad de cada operación tomando en cuenta que esta se obtiene de Venta-Costo

=== 🗄️ ESTRUCTURA DE DATOS ===

Tabla: Tmp_AnalisisComercial_prueba

Columnas disponibles:
- mes, año, Fecha (datetime)
- Venta (numeric) - Monto de la operación
- Costo (numeric) - Costo de la operación
- Markup (calculado) = Venta / Costo
- [Linea Servicio] (varchar) - Línea de servicio
- origen_cotizado (varchar)
- parametro_GEP (varchar) - SI/NO
- ListaCostoEFC (varchar) - SI/NO
- Rango_Operativo (varchar)
- SECTOR (varchar)
- DivisionNegocio (varchar)
- documento (varchar)
- [Codigo Cliente] (char) – llave foránea tabla temporal_cliente


Tabla: temporal_cliente
- [Codigo Cliente] (char) – llave principal
- Cliente (varchar)
- Sector (varchar)
- Segmento (varchar)
- [Grupo cliente] (varchar)


=== 🔍 INSTRUCCIONES DE ANÁLISIS ===

**Definición de combinación comercial:**
Se forma uniendo: [Linea Servicio] + origen_cotizado + parametro_GEP + ListaCostoEFC + Rango_Operativo + SECTOR + DivisionNegocio
(NO usar Fecha ni documento para agrupar)

**Filtros mínimos:**
- Solo analizar combinaciones con al menos 3 periodos de datos distintos
- Considerar solo combinaciones con Venta > $1,000

**Indicadores a calcular:**
- Rentabilidad = Venta - Costo
- Markup = Venta / Costo
- Volumen_movil_3m: Venta acumulada de 3 meses
- Participación_anual: Proporción del volumen anual

**Clasificación estratégica:**
- RENTABLE: Markup > 1.28, Venta acumulada > $10,000, participación > 5%
- FUGA ESTRATÉGICA: Markup < 1.22 y Venta > $10,000
- TESORO OCULTO: Markup > 1.29 y Venta < $5,000
- REVISAR: Markup entre 1.22 y 1.29
- NEUTRO: Todo lo demás

**Alertas a detectar:**
🚨 Traslado de ahorro: parametro_GEP = "SI" o ListaCostoEFC = "SI" y Markup < 1.25
⚠️ Zona crítica: Rango 1-3 y Markup < 1.25
📉 Erosión de margen: Venta crece pero Markup cae
📊 Sector involucionando: Venta decrece sostenidamente

**Consideraciones:**
- Ignorar outliers positivos (ventas pico atípicas)
- Considerar válidos los montos negativos (notas de crédito)
- No evaluar por año calendario, sino por combinación
- Fecha y documento solo para ver evolución, no para agrupar

=== 📄 FORMATO DE SALIDA ===

**1. TÍTULO EJECUTIVO**
Breve y descriptivo, complementado con gráficas y una grilla resumen de datos

**2. MÉTRICAS CLAVE** (con emojis)
💰 Total Ventas: $X,XXX
📊 Markup Promedio: X.XX%
📈 Combinaciones Rentables: XX

**3. CLASIFICACIÓN DE COMBINACIONES**
Presenta 2 ejemplos por tipo (RENTABLE, FUGA, TESORO, etc.)

**4. ALERTAS DETECTADAS**
Lista clara con datos reales de combinaciones afectadas

**5. RECOMENDACIONES ACCIONABLES**
Decisiones estratégicas priorizadas con contexto y justificación

**6. CONCLUSIÓN**
Decisiones estratégicas priorizadas para el comité directivo

=== 🚫 PROHIBICIONES ===
- NO uses párrafos largos
- NO uses lenguaje técnico innecesario
- SÉ CONCISO, VISUAL y EJECUTIVO
- USA emojis para claridad visual

Responde siempre en español con lenguaje ejecutivo.',
        1,
        1
    );
    PRINT '✅ Prompt inicial v1 insertado como activo';
END
ELSE
BEGIN
    PRINT 'ℹ️ Prompt inicial ya existe';
END
GO

-- ============================================
-- 9. Verificación final
-- ============================================
PRINT '';
PRINT '================================================';
PRINT '   VERIFICACIÓN DE TABLAS CREADAS';
PRINT '================================================';
SELECT 'user_profiles' as Tabla, COUNT(*) as Registros FROM user_profiles
UNION ALL
SELECT 'prompt_types', COUNT(*) FROM prompt_types
UNION ALL
SELECT 'prompts', COUNT(*) FROM prompts;

PRINT '';
PRINT '✅ Script completado exitosamente';
PRINT 'ℹ️ Verificar permisos de escritura para usuario MCP';
GO

