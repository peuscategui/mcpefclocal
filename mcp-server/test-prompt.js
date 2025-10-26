// test-prompt.js
import MCPClient from './mcp-client-backend/mcp-client.js';

async function testPrompt() {
  console.log('🧪 Iniciando prueba de prompts...\n');
  
  const client = new MCPClient();
  
  try {
    // Conectar al servidor MCP
    await client.connect();
    console.log('✅ Conectado al MCP Server\n');
    
    // Listar prompts disponibles
    console.log('📋 Prompts disponibles:');
    const prompts = await client.listPrompts();
    console.log(JSON.stringify(prompts, null, 2));
    console.log('\n');
    
    // Obtener el prompt sql_assistant
    console.log('📝 Obteniendo prompt sql_assistant...\n');
    const prompt = await client.getPrompt('sql_assistant', { task: 'analysis' });
    
    console.log('=== PROMPT GENERADO ===');
    console.log(prompt.messages[0].content.text);
    console.log('\n=== FIN DEL PROMPT ===\n');
    
    // Verificar que contiene tus tablas
    const promptText = prompt.messages[0].content.text;
    if (promptText.includes('Tmp_AnalisisComercial_prueba')) {
      console.log('✅ El prompt contiene tus tablas reales');
    } else {
      console.log('⚠️ Verifica la conexión a tu base de datos');
    }
    
    await client.disconnect();
    console.log('\n✅ Prueba completada');
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    console.error(error.stack);
  }
}

testPrompt();

