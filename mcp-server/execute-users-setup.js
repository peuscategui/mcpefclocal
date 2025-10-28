import sql from 'mssql';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function executeUsersSetup() {
  console.log('🚀 Iniciando creación de usuarios de prueba...\n');

  const config = {
    server: process.env.DB_HOST || '192.168.2.18',
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'PRUEBA_MCP',
    user: process.env.DB_USER || 'MCP',
    password: process.env.DB_PASSWORD || 'm_25_9e_pe1_',
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true' || true,
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || true,
      enableArithAbort: true,
      useUTC: false
    }
  };

  let pool;
  try {
    console.log('📡 Conectando a SQL Server...');
    console.log(`   Host: ${config.server}:${config.port}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   User: ${config.user}\n`);

    pool = await sql.connect(config);
    console.log('✅ Conectado exitosamente\n');

    // Leer script SQL
    const scriptPath = path.join(process.cwd(), 'sql', 'create-admin-user.sql');
    const sqlScript = fs.readFileSync(scriptPath, 'utf-8');
    
    console.log('📄 Script SQL cargado exitosamente');
    console.log(`📏 Tamaño: ${sqlScript.length} caracteres\n`);
    
    // Dividir el script por GO
    const batches = sqlScript
      .replace(/\r\n/g, '\n')
      .split(/^GO$/mi)
      .map(batch => batch.trim())
      .filter(batch => {
        if (!batch) return false;
        if (batch.match(/^USE \[.*\]$/mi)) return false;
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
        const request = pool.request();
        
        // Capturar mensajes PRINT
        request.on('info', (info) => {
          console.log(`   ${info.message}`);
        });
        
        await request.query(batch);
        
      } catch (error) {
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes('already exists') || 
            errorMsg.includes('ya existe') ||
            errorMsg.includes('there is already an object')) {
          console.log(`   ℹ️ ${error.message}`);
        } else {
          console.error(`   ❌ Error en lote ${i + 1}:`, error.message);
          throw error;
        }
      }
    }

    console.log('─'.repeat(60));
    console.log('\n✅ Usuarios de prueba creados exitosamente\n');

    // Verificar usuarios creados
    console.log('📋 Verificando usuarios en la tabla users:\n');
    const usersResult = await pool.request().query(`
      SELECT id, username, name, email, profile, is_active, 
             CONVERT(VARCHAR, created_at, 120) as created_at
      FROM users
      ORDER BY id
    `);

    if (usersResult.recordset.length > 0) {
      console.table(usersResult.recordset);
      console.log(`\n✅ Total de usuarios: ${usersResult.recordset.length}`);
    } else {
      console.log('⚠️ No se encontraron usuarios en la tabla');
    }

  } catch (error) {
    console.error('\n❌ Error fatal:', error.message);
    console.log('\n💡 Verifica:');
    console.log('   - Las credenciales de la base de datos');
    console.log('   - Los permisos del usuario MCP');
    console.log('   - La conectividad al servidor SQL');
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('\n🔌 Conexión cerrada');
    }
  }
}

executeUsersSetup().catch(error => {
  console.error('\n❌ Error inesperado:', error);
  process.exit(1);
});

