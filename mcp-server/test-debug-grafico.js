// test-debug-grafico.js
import dotenv from 'dotenv';
import MCPClient from './mcp-client.js';

// Cargar variables de entorno
dotenv.config({ path: './.env' });

async function testDebugGrafico() {
  console.log('🧪 Debug: Verificando datos para gráfico...\n');
  
  const client = new MCPClient();
  
  try {
    await client.connect();
    console.log('✅ Conectado al MCP Server\n');
    
    // Probar la consulta específica que está fallando
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
                             SUM(venta) as Ventas,
                             COUNT(*) as Transacciones,
                             AVG(venta) as PromedioVenta
                      FROM Tmp_AnalisisComercial_prueba 
                      WHERE YEAR(fecha) = 2024
                      GROUP BY MONTH(fecha)
                      ORDER BY MesNumero ASC`;
    
    console.log('📝 Ejecutando consulta SQL:');
    console.log(sqlQuery);
    console.log('\n');
    
    const result = await client.executeQuery(sqlQuery);
    
    console.log('📊 Resultado completo:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.content && result.content[0]) {
      const data = JSON.parse(result.content[0].text);
      console.log('\n📈 Datos parseados:');
      console.log(`Total de filas: ${data.rowCount}`);
      
      if (data.data && data.data.length > 0) {
        console.log('\n🔍 Estructura de datos:');
        console.log('Primera fila:', data.data[0]);
        console.log('\n📋 Campos disponibles en primera fila:');
        console.log(Object.keys(data.data[0]));
        
        console.log('\n📊 Simulando mapeo de labels:');
        data.data.forEach((item, index) => {
          console.log(`Item ${index}:`, item);
          console.log(`  - MesNumero: ${item.MesNumero}`);
          console.log(`  - Mes: ${item.Mes}`);
          console.log(`  - Ventas: ${item.Ventas}`);
          
          // Simular la lógica del frontend
          let label;
          if (item.Mes && typeof item.Mes === 'string') {
            label = item.Mes;
            console.log(`  ✅ Label: ${label} (usando Mes string)`);
          } else if (item.MesNumero) {
            const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            label = meses[item.MesNumero - 1] || `Mes ${item.MesNumero}`;
            console.log(`  ✅ Label: ${label} (convirtiendo MesNumero)`);
          } else {
            label = `Punto ${index + 1}`;
            console.log(`  ⚠️ Label: ${label} (fallback)`);
          }
        });
      } else {
        console.log('⚠️ No se encontraron datos para 2024');
      }
    }
    
    await client.disconnect();
    console.log('\n✅ Debug completado');
    
  } catch (error) {
    console.error('❌ Error en el debug:', error.message);
    console.error(error.stack);
  }
}

testDebugGrafico();

