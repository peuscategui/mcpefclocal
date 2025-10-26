// test-prompt-simple.js
import MCPClient from './mcp-client-backend/mcp-client.js';

async function testPromptSimple() {
  console.log('🧪 Prueba simple de prompts...');
  
  const client = new MCPClient('localhost', 3000);
  
  try {
    await client.connect();
    console.log('✅ Conectado');
    
    const prompts = await client.listPrompts();
    console.log('📋 Prompts:', prompts);
    
    await client.disconnect();
    console.log('✅ Completado');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testPromptSimple();

