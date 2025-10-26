// test-stdio-mcp.js
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testStdioMCP() {
  console.log('🧪 Probando MCP Server con protocolo stdio...\n');
  
  // Iniciar el servidor MCP como proceso hijo
  const serverPath = join(__dirname, 'mcp-server.js');
  const serverProcess = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let serverOutput = '';
  let serverError = '';
  
  serverProcess.stdout.on('data', (data) => {
    serverOutput += data.toString();
    console.log('📤 Server stdout:', data.toString().trim());
  });
  
  serverProcess.stderr.on('data', (data) => {
    serverError += data.toString();
    console.log('📤 Server stderr:', data.toString().trim());
  });
  
  serverProcess.on('close', (code) => {
    console.log(`\n🔚 Server process closed with code ${code}`);
    console.log('📄 Server output:', serverOutput);
    if (serverError) {
      console.log('❌ Server errors:', serverError);
    }
  });
  
  // Esperar un poco para que el servidor se inicie
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Enviar mensaje de inicialización
  const initMessage = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };
  
  console.log('\n📤 Enviando mensaje de inicialización...');
  serverProcess.stdin.write(JSON.stringify(initMessage) + '\n');
  
  // Esperar respuesta
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Probar prompts
  const promptsMessage = {
    jsonrpc: '2.0',
    id: 2,
    method: 'prompts/list',
    params: {}
  };
  
  console.log('📤 Enviando solicitud de prompts...');
  serverProcess.stdin.write(JSON.stringify(promptsMessage) + '\n');
  
  // Esperar respuesta
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Terminar el servidor
  serverProcess.kill();
  
  console.log('\n✅ Prueba completada');
}

testStdioMCP().catch(console.error);

