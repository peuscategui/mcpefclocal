// Script para verificar permisos del usuario MCP
import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

async function checkPermissions() {
  console.log('🔍 Verificando permisos del usuario MCP...\n');
  
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

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conexión exitosa\n');

    // Verificar permisos del usuario
    console.log('📋 Permisos actuales del usuario MCP:\n');
    const permissions = await pool.request().query(`
      SELECT 
        dp.name AS usuario,
        dp.type_desc AS tipo_usuario,
        CASE 
          WHEN p.class = 0 THEN 'DATABASE'
          WHEN p.class = 1 THEN ISNULL(o.name, 'OBJECT')
          WHEN p.class = 3 THEN 'SCHEMA'
          ELSE 'OTHER'
        END AS clase_objeto,
        ISNULL(o.name, p.class_desc) AS objeto,
        p.permission_name AS permiso,
        p.state_desc AS estado
      FROM sys.database_permissions AS p
      INNER JOIN sys.database_principals AS dp ON p.grantee_principal_id = dp.principal_id
      LEFT JOIN sys.objects AS o ON p.major_id = o.object_id AND p.class = 1
      WHERE dp.name = 'MCP'
      ORDER BY clase_objeto, objeto, permiso
    `);

    if (permissions.recordset.length === 0) {
      console.log('❌ El usuario MCP no tiene permisos asignados explícitamente');
      console.log('\n💡 Es posible que herede permisos de roles. Verificando roles...\n');
    } else {
      console.table(permissions.recordset);
    }

    // Verificar roles del usuario
    console.log('\n👥 Roles del usuario MCP:\n');
    const roles = await pool.request().query(`
      SELECT 
        dp.name AS usuario,
        r.name AS rol
      FROM sys.database_role_members AS rm
      INNER JOIN sys.database_principals AS dp ON rm.member_principal_id = dp.principal_id
      INNER JOIN sys.database_principals AS r ON rm.role_principal_id = r.principal_id
      WHERE dp.name = 'MCP'
    `);

    if (roles.recordset.length === 0) {
      console.log('⚠️ El usuario MCP no pertenece a ningún rol');
    } else {
      console.table(roles.recordset);
    }

    // Verificar si puede crear tablas
    console.log('\n🧪 Probando si puede crear una tabla de prueba...\n');
    try {
      await pool.request().query(`
        CREATE TABLE test_permissions_table (
          id INT PRIMARY KEY,
          test_data VARCHAR(50)
        )
      `);
      console.log('✅ ¡El usuario MCP puede crear tablas!');
      
      // Eliminar la tabla de prueba
      await pool.request().query('DROP TABLE test_permissions_table');
      console.log('✅ Tabla de prueba eliminada');
      
    } catch (error) {
      console.error('❌ El usuario MCP NO puede crear tablas');
      console.error(`   Error: ${error.message}`);
      console.log('\n💡 Necesitas ejecutar este comando como administrador (sa):');
      console.log('   GRANT CREATE TABLE TO [MCP]');
    }

    await pool.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkPermissions();

