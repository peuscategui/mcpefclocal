// Script temporal para ejecutar setup-prompts-tables.sql
import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function executeSetupScript() {
  console.log('🚀 Iniciando ejecución del script de setup de prompts...\n');
  
  const config = {
    server: process.env.DB_HOST || '192.168.2.18',
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'PRUEBA_MCP',
    user: process.env.DB_USER || 'MCP',
    password: process.env.DB_PASSWORD || 'm_25_9e_pe1_',
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
  };

  console.log(`📊 Conectando a: ${config.server}:${config.port}`);
  console.log(`📁 Base de datos: ${config.database}`);
  console.log(`👤 Usuario: ${config.user}\n`);

  try {
    // Conectar a SQL Server
    const pool = await sql.connect(config);
    console.log('✅ Conexión exitosa a SQL Server\n');

    // Leer el script SQL
    const scriptPath = path.join(process.cwd(), 'sql', 'setup-prompts-tables.sql');
    const sqlScript = fs.readFileSync(scriptPath, 'utf-8');
    
    console.log('📄 Script SQL cargado exitosamente');
    console.log(`📏 Tamaño: ${sqlScript.length} caracteres\n`);
    
    // Dividir el script por GO (ignorando comentarios y líneas vacías)
    const batches = sqlScript
      .replace(/\r\n/g, '\n') // Normalizar saltos de línea
      .split(/^GO$/mi) // Dividir por GO en líneas separadas
      .map(batch => batch.trim())
      .filter(batch => {
        // Filtrar batches vacíos y comandos USE
        if (!batch) return false;
        if (batch.match(/^USE \[.*\]$/mi)) return false;
        // Filtrar si solo tiene comentarios
        const lines = batch.split('\n').filter(line => {
          const trimmed = line.trim();
          return trimmed && !trimmed.startsWith('--');
        });
        return lines.length > 0;
      });

    console.log(`🔢 Ejecutando ${batches.length} lotes de comandos SQL...\n`);
    console.log('─'.repeat(60));

    // Ejecutar cada batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        // Capturar mensajes PRINT de SQL Server
        const request = pool.request();
        request.on('info', (info) => {
          console.log(`   ${info.message}`);
        });
        
        await request.query(batch);
        
      } catch (error) {
        // Algunos errores son informativos (ej: "objeto ya existe")
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes('already exists') || 
            errorMsg.includes('ya existe') ||
            errorMsg.includes('there is already an object')) {
          console.log(`   ℹ️ ${error.message}`);
        } else {
          console.error(`   ❌ Error en lote ${i + 1}:`, error.message);
          console.error(`   📝 Batch que falló (primeras 200 chars):`, batch.substring(0, 200));
          throw error;
        }
      }
    }

    console.log('─'.repeat(60));
    console.log('\n✅ Script ejecutado exitosamente\n');

    // Verificar las tablas creadas
    console.log('🔍 Verificando tablas creadas...\n');
    
    const verification = await pool.request().query(`
      SELECT 'user_profiles' as Tabla, COUNT(*) as Registros FROM user_profiles
      UNION ALL
      SELECT 'prompt_types', COUNT(*) FROM prompt_types
      UNION ALL
      SELECT 'prompts', COUNT(*) FROM prompts
    `);

    console.log('📊 Resultado de la verificación:');
    verification.recordset.forEach(row => {
      console.log(`   ✓ ${row.Tabla}: ${row.Registros} registros`);
    });

    // Mostrar el prompt inicial creado
    console.log('\n📝 Prompt inicial creado:');
    const initialPrompt = await pool.request().query(`
      SELECT TOP 1 
        p.id, p.name, p.version, p.is_active,
        pt.type_name,
        LEN(p.content) as content_length
      FROM prompts p
      INNER JOIN prompt_types pt ON p.prompt_type_id = pt.id
      ORDER BY p.id
    `);

    if (initialPrompt.recordset.length > 0) {
      const prompt = initialPrompt.recordset[0];
      console.log(`   ID: ${prompt.id}`);
      console.log(`   Nombre: ${prompt.name}`);
      console.log(`   Versión: ${prompt.version}`);
      console.log(`   Tipo: ${prompt.type_name}`);
      console.log(`   Estado: ${prompt.is_active ? '🟢 ACTIVO' : '⚪ INACTIVO'}`);
      console.log(`   Tamaño: ${prompt.content_length} caracteres`);
    }

    // Cerrar conexión
    await pool.close();
    console.log('\n🔌 Conexión cerrada');
    console.log('\n🎉 ¡Setup completado con éxito!');
    
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error fatal:', error.message);
    console.error('\n💡 Verifica:');
    console.error('   - Las credenciales de la base de datos');
    console.error('   - Los permisos del usuario MCP');
    console.error('   - La conectividad al servidor SQL');
    process.exit(1);
  }
}

// Ejecutar
executeSetupScript();

