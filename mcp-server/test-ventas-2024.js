// test-ventas-2024.js
import dotenv from 'dotenv';
import MCPClient from './mcp-client.js';

// Cargar variables de entorno
dotenv.config({ path: './.env' });

async function testVentas2024() {
  console.log('🧪 Probando consulta de ventas 2024...\n');
  
  const client = new MCPClient();
  
  try {
    await client.connect();
    console.log('✅ Conectado al MCP Server\n');
    
    // Probar la consulta específica
    const sqlQuery = `SELECT MONTH(fecha) as Mes, 
                             SUM(venta) as Ventas,
                             COUNT(*) as Transacciones,
                             AVG(venta) as PromedioVenta
                      FROM Tmp_AnalisisComercial_prueba 
                      WHERE YEAR(fecha) = 2024
                      GROUP BY MONTH(fecha) 
                      ORDER BY Mes ASC`;
    
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
        console.log('\n📋 Datos por mes:');
        data.data.forEach(row => {
          console.log(`Mes ${row.Mes}: S/ ${row.Ventas?.toLocaleString() || 'N/A'} (${row.Transacciones} transacciones)`);
        });
      } else {
        console.log('⚠️ No se encontraron datos para 2024');
      }
    }
    
    await client.disconnect();
    console.log('\n✅ Prueba completada');
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    console.error(error.stack);
  }
}

testVentas2024();

