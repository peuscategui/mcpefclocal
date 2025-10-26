// test-quick.js
import MCPClient from './mcp-client-backend/mcp-client.js';

const client = new MCPClient('localhost', 3000);

try {
  console.log('Conectando...');
  await client.connect();
  console.log('Conectado!');
  
  console.log('Probando prompts...');
  const prompts = await client.listPrompts();
  console.log('Prompts:', JSON.stringify(prompts, null, 2));
  
  await client.disconnect();
  console.log('Listo!');
} catch (error) {
  console.error('Error:', error.message);
}

