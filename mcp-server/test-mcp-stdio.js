// test-mcp-stdio.js
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testMCPStdio() {
  console.log('🧪 Probando MCP Server con protocolo stdio...\n');
  
  try {
    // Iniciar el servidor MCP
    const serverPath = join(__dirname, 'mcp-server.js');
    const serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let responses = [];
    
    serverProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          responses.push(response);
          console.log('📥 Respuesta recibida:', JSON.stringify(response, null, 2));
        } catch (e) {
          console.log('📤 Server output:', line);
        }
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      console.log('📤 Server stderr:', data.toString().trim());
    });
    
    // Esperar que el servidor se inicie
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Enviar inicialización
    const initMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    };
    
    console.log('📤 Enviando inicialización...');
    serverProcess.stdin.write(JSON.stringify(initMessage) + '\n');
    
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
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Probar resources
    const resourcesMessage = {
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/list',
      params: {}
    };
    
    console.log('📤 Enviando solicitud de resources...');
    serverProcess.stdin.write(JSON.stringify(resourcesMessage) + '\n');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    serverProcess.kill();
    
    console.log('\n✅ Prueba completada');
    console.log(`📊 Total respuestas: ${responses.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testMCPStdio();

