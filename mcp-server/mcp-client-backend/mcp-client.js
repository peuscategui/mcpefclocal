// Cliente TCP para conectar al servidor MCP
import net from 'net';
import { EventEmitter } from 'events';

class MCPClient extends EventEmitter {
  constructor(host = 'localhost', port = 3000) {
    super();
    this.host = host;
    this.port = port;
    this.socket = null;
    this.messageId = 0;
    this.isConnected = false;
    this.pendingRequests = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new net.Socket();
        
        // ⚠️ DEBUG: Ver qué hostname estamos usando
        console.log(`🔍 DEBUG - Intento de conexión MCP: host="${this.host}", port=${this.port}`);
        
        // Forzar IPv4 para evitar problemas con ::1 (IPv6 localhost)
        const options = {
          port: this.port,
          host: this.host,
          family: 4  // IPv4
        };
        
        this.socket.connect(options, () => {
          console.log(`✅ Conectado al servidor MCP en ${this.host}:${this.port}`);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.setupSocketHandlers();
          this.emit('connected');
          resolve();
        });

        this.socket.on('error', (error) => {
          console.error('❌ Error de conexión MCP:', error.message);
          this.isConnected = false;
          this.emit('error', error);
          reject(error);
        });

        this.socket.on('close', () => {
          console.log('🔌 Conexión MCP cerrada');
          this.isConnected = false;
          this.emit('disconnected');
          this.handleReconnection();
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  setupSocketHandlers() {
    let buffer = '';
    
    this.socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Mantener línea incompleta
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.handleMessage(message);
          } catch (error) {
            console.error('❌ Error parseando mensaje MCP:', error.message);
            console.error('Datos recibidos:', line);
          }
        }
      }
    });
  }

  handleMessage(message) {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(message.error.message || 'Error MCP'));
      } else {
        resolve(message.result);
      }
    } else {
      // Mensaje sin ID (notificación)
      this.emit('notification', message);
    }
  }

  async sendRequest(method, params = {}) {
    if (!this.isConnected) {
      throw new Error('No hay conexión con el servidor MCP');
    }

    const id = ++this.messageId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      const message = JSON.stringify(request) + '\n';
      this.socket.write(message);
      
      // Timeout de 30 segundos
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Timeout de solicitud MCP'));
        }
      }, 30000);
    });
  }

  async initialize() {
    try {
      const result = await this.sendRequest('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'mcp-web-client',
          version: '1.0.0'
        }
      });
      
      console.log('✅ MCP inicializado:', result);
      return result;
    } catch (error) {
      console.error('❌ Error inicializando MCP:', error.message);
      throw error;
    }
  }

  async listTools() {
    try {
      const result = await this.sendRequest('tools/list');
      console.log('📋 Herramientas MCP disponibles:', result.tools?.length || 0);
      return result.tools || [];
    } catch (error) {
      console.error('❌ Error listando herramientas MCP:', error.message);
      throw error;
    }
  }

  async callTool(toolName, args = {}) {
    try {
      const startTime = Date.now();
      const result = await this.sendRequest('tools/call', {
        name: toolName,
        arguments: args
      });
      const executionTime = Date.now() - startTime;
      
      console.log(`🔧 Herramienta ${toolName} ejecutada en ${executionTime}ms`);
      return {
        ...result,
        executionTime
      };
    } catch (error) {
      console.error(`❌ Error ejecutando herramienta ${toolName}:`, error.message);
      throw error;
    }
  }

  async getTables() {
    return await this.callTool('get_tables');
  }

  async describeTable(tableName) {
    return await this.callTool('describe_table', { table_name: tableName });
  }

  async executeQuery(query, params = {}) {
    // Limitar automáticamente consultas SELECT para evitar exceder límites de tokens
    let modifiedQuery = query.trim();
    const upperQuery = modifiedQuery.toUpperCase();
    
    if (upperQuery.startsWith('SELECT') && !upperQuery.includes('TOP ')) {
      // Agregar TOP 100 después de SELECT
      modifiedQuery = modifiedQuery.replace(/^SELECT\s+/i, 'SELECT TOP 100 ');
      console.log(`⚠️ Consulta limitada automáticamente a TOP 100 registros`);
    }
    
    return await this.callTool('execute_query', { query: modifiedQuery, params });
  }

  handleReconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`🔄 Reintentando conexión MCP en ${delay}ms (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect().catch(error => {
          console.error('❌ Error en reconexión MCP:', error.message);
        });
      }, delay);
    } else {
      console.error('❌ Máximo número de reintentos de conexión MCP alcanzado');
      this.emit('maxReconnectAttemptsReached');
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.isConnected = false;
    }
  }

  isHealthy() {
    return this.isConnected && this.socket && !this.socket.destroyed;
  }

  // ============ PROMPTS ============
  async listPrompts() {
    console.log('📝 Listando prompts disponibles...');
    const result = await this.sendRequest('prompts/list');
    return result;
  }

  async getPrompt(name, args = {}) {
    console.log(`📝 Obteniendo prompt: ${name}`, args);
    const result = await this.sendRequest('prompts/get', {
      name: name,
      arguments: args
    });
    return result;
  }

  // ============ RESOURCES ============
  async listResources() {
    console.log('📦 Listando recursos disponibles...');
    const result = await this.sendRequest('resources/list');
    return result;
  }

  async readResource(uri) {
    console.log(`📦 Leyendo recurso: ${uri}`);
    const result = await this.sendRequest('resources/read', { uri });
    return result;
  }
}

export default MCPClient;
