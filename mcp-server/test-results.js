// test-results.js
import MCPClient from './mcp-client-backend/mcp-client.js';

async function testResults() {
  const client = new MCPClient('localhost', 3000);
  
  try {
    console.log('=== INICIANDO PRUEBA ===');
    await client.connect();
    console.log('✅ Conectado al MCP Server');
    
    console.log('\n=== PROBANDO PROMPTS ===');
    const prompts = await client.listPrompts();
    console.log('📋 Resultado prompts:', JSON.stringify(prompts, null, 2));
    
    console.log('\n=== PROBANDO RESOURCES ===');
    const resources = await client.listResources();
    console.log('📦 Resultado resources:', JSON.stringify(resources, null, 2));
    
    await client.disconnect();
    console.log('\n=== PRUEBA COMPLETADA ===');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

testResults();

