import MCPClient from './mcp-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testColumns() {
  const client = new MCPClient(
    process.env.MCP_SERVER_HOST || 'localhost',
    parseInt(process.env.MCP_SERVER_PORT) || 3000
  );

  try {
    console.log('🔌 Conectando al servidor MCP...');
    await client.connect();
    await client.initialize();

    console.log('\n📋 Obteniendo tablas...');
    const tables = await client.getTables();
    console.log('Tablas:', JSON.stringify(tables, null, 2));

    console.log('\n📊 Describiendo tabla Tmp_AnalisisComercial_prueba...');
    const tableInfo = await client.describeTable('Tmp_AnalisisComercial_prueba');
    console.log('Estructura:', JSON.stringify(tableInfo, null, 2));

    console.log('\n📊 Describiendo tabla temporal_cliente...');
    const clientTableInfo = await client.describeTable('temporal_cliente');
    console.log('Estructura:', JSON.stringify(clientTableInfo, null, 2));

    client.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    client.disconnect();
    process.exit(1);
  }
}

testColumns();

