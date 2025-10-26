// test-ultimo-mes.js
import dotenv from 'dotenv';
import MCPClient from './mcp-client.js';

// Cargar variables de entorno
dotenv.config({ path: './.env' });

async function testUltimoMes() {
  console.log('🧪 Probando consulta del último mes...\n');
  
  const client = new MCPClient();
  
  try {
    await client.connect();
    console.log('✅ Conectado al MCP Server\n');
    
    // Probar la consulta específica para último mes
    const sqlQuery = `SELECT DAY(fecha) as Dia, 
                             SUM(venta) as Ventas,
                             COUNT(*) as Transacciones
                      FROM Tmp_AnalisisComercial_prueba 
                      WHERE fecha >= DATEADD(MONTH, -1, GETDATE())
                      GROUP BY DAY(fecha)
                      ORDER BY Dia ASC`;
    
    console.log('📝 Ejecutando consulta SQL:');
    console.log(sqlQuery);
    console.log('\n');
    
    const result = await client.executeQuery(sqlQuery);
    
    console.log('📊 Resultado obtenido:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.content && result.content[0]) {
      const data = JSON.parse(result.content[0].text);
      console.log('\n📈 Datos parseados:');
      console.log(`Total de filas: ${data.rowCount}`);
      
      if (data.data && data.data.length > 0) {
        console.log('\n📋 Datos por día del último mes:');
        data.data.forEach(row => {
          console.log(`Día ${row.Dia}: S/ ${row.Ventas?.toLocaleString() || 'N/A'} (${row.Transacciones} transacciones)`);
        });
      } else {
        console.log('⚠️ No se encontraron datos para el último mes');
      }
    }
    
    await client.disconnect();
    console.log('\n✅ Prueba completada');
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    console.error(error.stack);
  }
}

testUltimoMes();

