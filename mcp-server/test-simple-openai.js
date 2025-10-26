// test-simple-openai.js
import OpenAIService from './mcp-client-backend/openai-service.js';

async function testSimpleOpenAI() {
  console.log('🧪 Prueba simple: OpenAI Service\n');
  
  const openai = new OpenAIService();
  
  try {
    console.log('1️⃣ Probando conexión MCP...');
    const mcpClient = await openai.getMCPClient();
    console.log('✅ MCP Client conectado');
    
    console.log('\n2️⃣ Probando prompt sql_assistant...');
    const prompt = await mcpClient.getPrompt('sql_assistant', { task: 'analysis' });
    console.log('✅ Prompt obtenido:', prompt.messages[0].content.text.substring(0, 100) + '...');
    
    console.log('\n3️⃣ Probando chat simple...');
    const response = await openai.chat('¿qué tablas tienes disponibles?');
    console.log('✅ Respuesta:', response.content);
    
    await openai.close();
    console.log('\n✅ Prueba completada exitosamente');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testSimpleOpenAI();

