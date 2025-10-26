// test-simple.js
import MCPClient from './mcp-client-backend/mcp-client.js';

async function testSimple() {
  console.log('🧪 Prueba simple de conexión MCP...\n');
  
  const client = new MCPClient();
  
  try {
    // Conectar al servidor MCP
    await client.connect();
    console.log('✅ Conectado al MCP Server\n');
    
    // Listar herramientas disponibles
    console.log('🔧 Herramientas disponibles:');
    const tools = await client.listTools();
    console.log(JSON.stringify(tools, null, 2));
    console.log('\n');
    
    // Probar una herramienta simple
    console.log('📊 Probando get_tables...');
    const tables = await client.getTables();
    console.log('Tablas encontradas:', tables.content[0].text);
    
    await client.disconnect();
    console.log('\n✅ Prueba simple completada');
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    console.error(error.stack);
  }
}

testSimple();