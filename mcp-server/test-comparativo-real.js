import MCPClient from './mcp-client-backend/mcp-client.js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function testComparativoReal() {
  console.log('🧪 Verificando datos reales para comparativo...\n');
  const mcpClient = new MCPClient();

  try {
    await mcpClient.connect();
    console.log('✅ Conectado al servidor MCP\n');

    // Verificar qué años tenemos en la base de datos
    const sqlVerificarAños = `
      SELECT DISTINCT YEAR(fecha) as Año, COUNT(*) as Registros
      FROM Tmp_AnalisisComercial_prueba
      GROUP BY YEAR(fecha)
      ORDER BY Año DESC
    `;

    console.log('📊 Verificando años disponibles...');
    const resultadoAños = await mcpClient.executeQuery(sqlVerificarAños);
    
    if (resultadoAños.content && resultadoAños.content[0]) {
      const data = JSON.parse(resultadoAños.content[0].text);
      console.log('\n=== AÑOS DISPONIBLES EN LA BASE DE DATOS ===');
      console.log(JSON.stringify(data, null, 2));
      console.log('============================================\n');
    }

    // Ahora ejecutar el SQL comparativo
    const sqlComparativo = `
      SELECT 
        YEAR(fecha) as Año,
        MONTH(fecha) as MesNumero,
        CASE MONTH(fecha)
          WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
          WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
          WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
          WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
        END as Mes,
        SUM(venta) as Ventas,
        COUNT(*) as Transacciones,
        AVG(venta) as PromedioVenta
      FROM Tmp_AnalisisComercial_prueba 
      WHERE YEAR(fecha) IN (2024, 2025)
      GROUP BY YEAR(fecha), MONTH(fecha)
      ORDER BY Año, MesNumero ASC
    `;

    console.log('📊 Ejecutando SQL comparativo...');
    const resultadoComparativo = await mcpClient.executeQuery(sqlComparativo);
    
    if (resultadoComparativo.content && resultadoComparativo.content[0]) {
      const data = JSON.parse(resultadoComparativo.content[0].text);
      console.log('\n=== DATOS COMPARATIVOS ===');
      console.log(JSON.stringify(data, null, 2));
      console.log('===========================\n');
      
      if (data.data && data.data.length > 0) {
        const datos2024 = data.data.filter(d => d.Año === 2024);
        const datos2025 = data.data.filter(d => d.Año === 2025);
        
        console.log(`📊 Registros de 2024: ${datos2024.length}`);
        console.log(`📊 Registros de 2025: ${datos2025.length}`);
        
        if (datos2024.length === 0) {
          console.log('\n⚠️ ¡PROBLEMA ENCONTRADO!');
          console.log('❌ NO HAY DATOS DE 2024 en la base de datos');
          console.log('💡 Necesitas insertar datos de 2024 para hacer comparativos');
        } else {
          console.log('\n✅ Hay datos de ambos años para comparar');
        }
      }
    }

    await mcpClient.disconnect();
    console.log('\n✅ Prueba completada');

  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    console.error(error.stack);
  }
}

testComparativoReal();


