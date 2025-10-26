// test-prompts-only.js
import MCPClient from './mcp-client-backend/mcp-client.js';

async function testPromptsOnly() {
  console.log('🧪 Prueba específica de PROMPTS...\n');
  
  const client = new MCPClient('localhost', 3000);
  
  try {
    // Conectar
    console.log('🔌 Conectando al MCP Server...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');
    
    // Test 1: Listar prompts
    console.log('📋 TEST 1: Listando prompts disponibles...');
    try {
      const prompts = await client.listPrompts();
      console.log('✅ Prompts encontrados:', prompts);
    } catch (error) {
      console.log('❌ Error listando prompts:', error.message);
      console.log('⚠️ El servidor actual NO soporta prompts');
    }
    
    // Test 2: Obtener prompt específico
    console.log('\n📝 TEST 2: Obteniendo prompt sql_assistant...');
    try {
      const prompt = await client.getPrompt('sql_assistant', { task: 'analysis' });
      console.log('✅ Prompt obtenido exitosamente');
      console.log('📄 Contenido del prompt:');
      console.log('='.repeat(50));
      console.log(prompt.messages[0].content.text.substring(0, 500) + '...');
      console.log('='.repeat(50));
    } catch (error) {
      console.log('❌ Error obteniendo prompt:', error.message);
    }
    
    // Test 3: Listar resources
    console.log('\n📦 TEST 3: Listando resources...');
    try {
      const resources = await client.listResources();
      console.log('✅ Resources encontrados:', resources);
    } catch (error) {
      console.log('❌ Error listando resources:', error.message);
      console.log('⚠️ El servidor actual NO soporta resources');
    }
    
    await client.disconnect();
    console.log('\n✅ Prueba completada');
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

testPromptsOnly();

