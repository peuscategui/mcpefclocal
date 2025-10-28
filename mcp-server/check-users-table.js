import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

async function checkUsersTable() {
  console.log('🔍 Verificando estructura de la tabla users...\n');

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
    pool = await sql.connect(config);
    console.log('✅ Conectado\n');

    // Obtener columnas de la tabla users
    const columnsResult = await pool.request().query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE,
        COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'users'
      ORDER BY ORDINAL_POSITION
    `);

    if (columnsResult.recordset.length > 0) {
      console.log('📋 Columnas de la tabla users:\n');
      console.table(columnsResult.recordset);
    } else {
      console.log('⚠️ La tabla users no tiene columnas o no existe');
    }

    // Ver datos actuales
    const dataResult = await pool.request().query('SELECT TOP 5 * FROM users');
    
    if (dataResult.recordset.length > 0) {
      console.log('\n📄 Datos actuales en la tabla users:\n');
      console.table(dataResult.recordset);
    } else {
      console.log('\n⚠️ La tabla users está vacía');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

checkUsersTable();

