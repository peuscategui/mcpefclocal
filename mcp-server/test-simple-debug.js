// test-simple-debug.js
import dotenv from 'dotenv';
import MCPClient from './mcp-client.js';

dotenv.config({ path: './.env' });

async function testSimpleDebug() {
  console.log('🧪 Test simple de debug...\n');
  
  const client = new MCPClient();
  
  try {
    await client.connect();
    console.log('✅ Conectado al MCP Server\n');
    
    // Consulta simple
    const sqlQuery = `SELECT MONTH(fecha) as MesNumero,
                             CASE MONTH(fecha)
                               WHEN 1 THEN 'Enero'
                               WHEN 2 THEN 'Febrero'
                               WHEN 3 THEN 'Marzo'
                               WHEN 4 THEN 'Abril'
                               WHEN 5 THEN 'Mayo'
                               WHEN 6 THEN 'Junio'
                               WHEN 7 THEN 'Julio'
                               WHEN 8 THEN 'Agosto'
                               WHEN 9 THEN 'Septiembre'
                               WHEN 10 THEN 'Octubre'
                               WHEN 11 THEN 'Noviembre'
                               WHEN 12 THEN 'Diciembre'
                             END as Mes,
                             SUM(venta) as Ventas
                      FROM Tmp_AnalisisComercial_prueba 
                      WHERE YEAR(fecha) = 2024
                      GROUP BY MONTH(fecha)
                      ORDER BY MesNumero ASC
                      LIMIT 3`;
    
    console.log('📝 SQL:', sqlQuery);
    console.log('\n');
    
    const result = await client.executeQuery(sqlQuery);
    
    if (result.content && result.content[0]) {
      const data = JSON.parse(result.content[0].text);
      console.log('📊 Datos obtenidos:');
      console.log('Total filas:', data.rowCount);
      
      if (data.data && data.data.length > 0) {
        console.log('\n🔍 Primera fila:');
        console.log(JSON.stringify(data.data[0], null, 2));
        
        console.log('\n📋 Campos disponibles:');
        console.log(Object.keys(data.data[0]));
        
        console.log('\n📊 Valores específicos:');
        console.log('MesNumero:', data.data[0].MesNumero, typeof data.data[0].MesNumero);
        console.log('Mes:', data.data[0].Mes, typeof data.data[0].Mes);
        console.log('Ventas:', data.data[0].Ventas, typeof data.data[0].Ventas);
      }
    }
    
    await client.disconnect();
    console.log('\n✅ Test completado');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testSimpleDebug();

