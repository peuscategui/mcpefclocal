// test-openai-with-prompt.js
import dotenv from 'dotenv';
import OpenAIService from './mcp-client-backend/openai-service.js';

// Cargar variables de entorno
dotenv.config({ path: './.env' });

// Verificar que la API key esté configurada
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY no configurada en .env');
  process.exit(1);
}

async function testEndToEnd() {
  console.log('🧪 Prueba completa: OpenAI + MCP con Prompts\n');
  
  // Verificar que la API key esté cargada
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY no encontrada en las variables de entorno');
    return;
  }
  
  console.log('✅ OPENAI_API_KEY cargada correctamente');
  
  const openai = new OpenAIService();
  
  try {
    // Conversación inicial
    const response1 = await openai.chat('dame la tendencia de ventas del 2025');
    console.log('Respuesta 1:', response1.content);
    
    // Continuar conversación con contexto
    const response2 = await openai.chat(
      '¿y cuál fue el mejor mes?', 
      response1.conversationHistory
    );
    console.log('Respuesta 2:', response2.content);
    
    await openai.close();
    console.log('\n✅ Prueba completada exitosamente');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testEndToEnd();
