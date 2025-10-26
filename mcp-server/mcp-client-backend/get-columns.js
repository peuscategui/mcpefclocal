import MCPClient from './mcp-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function getRealColumns() {
  const client = new MCPClient('localhost', 3000);

  try {
    console.log('🔌 Conectando al servidor MCP...');
    await client.connect();
    await client.initialize();

    console.log('\n📊 Obteniendo estructura de Tmp_AnalisisComercial_prueba...');
    const result = await client.describeTable('Tmp_AnalisisComercial_prueba');
    
    console.log('\n📋 RESULTADO:');
    console.log(JSON.stringify(result, null, 2));

    client.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    client.disconnect();
    process.exit(1);
  }
}

getRealColumns();

