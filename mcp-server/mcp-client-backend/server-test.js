// Servidor simplificado del backend MCP Client (sin autenticación)
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

// Importar servicios
import MCPClient from './mcp-client.js';
import OpenAIService from './openai-service.js';
import DatabaseService from './db-service.js';

dotenv.config();

class MCPServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3001;
    this.mcpClient = new MCPClient(process.env.MCP_HOST, process.env.MCP_PORT);
    this.openaiService = new OpenAIService();
    this.dbService = new DatabaseService();
  }

  async initialize() {
    try {
      console.log('🚀 Iniciando servidor MCP Backend (modo prueba)...');
      
      // Conectar a servicios
      await this.dbService.connect();
      console.log('✅ Base de datos conectada');
      
      await this.mcpClient.connect();
      await this.mcpClient.initialize();
      console.log('✅ Cliente MCP conectado');
      
      // Configurar middleware
      this.setupMiddleware();
      
      // Configurar rutas
      this.setupRoutes();
      
      console.log('✅ Servidor inicializado correctamente');
      
    } catch (error) {
      console.error('❌ Error inicializando servidor:', error.message);
      throw error;
    }
  }

  setupMiddleware() {
    // Seguridad básica
    this.app.use(helmet());
    
    // CORS permisivo para pruebas
    this.app.use(cors({
      origin: '*',
      credentials: false
    }));

    // Compresión
    this.app.use(compression());

    // Parseo de JSON
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  setupRoutes() {
    // Ruta de health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        service: 'mcp-backend-test',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Ruta de información del servicio
    this.app.get('/info', (req, res) => {
      res.json({
        name: 'MCP Web Client Backend (Test Mode)',
        version: '1.0.0',
        description: 'Backend API para cliente web MCP - Modo de prueba sin autenticación',
        endpoints: {
          health: '/health',
          chat: '/api/chat',
          tools: '/api/tools',
          tables: '/api/tables'
        },
        features: [
          'Integración OpenAI con Function Calling',
          'Cliente MCP TCP',
          'Modo de prueba (sin autenticación)',
          'Rate limiting básico'
        ]
      });
    });

    // Ruta de chat simplificada (sin autenticación)
    this.app.post('/api/chat', async (req, res) => {
      try {
        const { message } = req.body;
        
        if (!message) {
          return res.status(400).json({
            error: 'Mensaje requerido',
            code: 'MESSAGE_REQUIRED'
          });
        }

        console.log(`💬 Procesando mensaje: "${message}"`);
        
        // Obtener tablas disponibles para contexto
        let availableTables = [];
        try {
          const tablesResult = await this.mcpClient.getTables();
          if (tablesResult.content && tablesResult.content[0]) {
            const tablesText = tablesResult.content[0].text;
            const tableMatches = tablesText.match(/•\s+(\w+\.\w+)/g);
            if (tableMatches) {
              availableTables = tableMatches.map(match => match.replace('• ', ''));
            }
          }
        } catch (error) {
          console.warn('⚠️ No se pudieron obtener las tablas para contexto:', error.message);
        }
        
        // Procesar consulta con OpenAI
        const openaiResponse = await this.openaiService.processUserQuery(
          message, 
          [], // Sin historial por ahora
          availableTables
        );
        
        let assistantResponse;
        let mcpToolUsed = null;
        let sqlQuery = null;
        let executionTime = null;
        
        if (openaiResponse.type === 'function_call') {
          // OpenAI quiere usar una herramienta MCP
          mcpToolUsed = openaiResponse.functionName;
          
          try {
            console.log(`🔧 Ejecutando herramienta MCP: ${mcpToolUsed}`);
            
            let mcpResult;
            switch (mcpToolUsed) {
              case 'get_tables':
                mcpResult = await this.mcpClient.getTables();
                break;
              case 'describe_table':
                mcpResult = await this.mcpClient.describeTable(openaiResponse.arguments.table_name);
                break;
              case 'execute_query':
                sqlQuery = openaiResponse.arguments.query;
                mcpResult = await this.mcpClient.executeQuery(sqlQuery, openaiResponse.arguments.params || {});
                break;
              default:
                throw new Error(`Herramienta MCP desconocida: ${mcpToolUsed}`);
            }
            
            executionTime = mcpResult.executionTime;
            
            // Procesar resultados con OpenAI
            const processedResponse = await this.openaiService.processMCPResults(
              mcpToolUsed,
              mcpResult,
              message,
              []
            );
            
            assistantResponse = processedResponse.content;
            
          } catch (mcpError) {
            console.error('❌ Error ejecutando herramienta MCP:', mcpError.message);
            assistantResponse = `Lo siento, hubo un error ejecutando la consulta: ${mcpError.message}`;
            mcpToolUsed = null;
            sqlQuery = null;
          }
        } else {
          // OpenAI responde directamente
          assistantResponse = openaiResponse.content;
        }
        
        res.json({
          success: true,
          response: {
            content: assistantResponse,
            mcpToolUsed,
            sqlQuery,
            executionTime,
            reasoning: openaiResponse.reasoning || 'Respuesta generada por IA'
          }
        });
        
      } catch (error) {
        console.error('❌ Error procesando chat:', error.message);
        res.status(500).json({
          error: 'Error procesando consulta',
          details: error.message,
          code: 'CHAT_ERROR'
        });
      }
    });

    // Ruta para obtener herramientas MCP disponibles
    this.app.get('/api/tools', async (req, res) => {
      try {
        const tools = await this.mcpClient.listTools();
        
        res.json({
          success: true,
          tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        });
        
      } catch (error) {
        console.error('❌ Error obteniendo herramientas:', error.message);
        res.status(500).json({
          error: 'Error obteniendo herramientas MCP',
          code: 'TOOLS_ERROR'
        });
      }
    });

    // Ruta para obtener tablas disponibles
    this.app.get('/api/tables', async (req, res) => {
      try {
        const result = await this.mcpClient.getTables();
        
        res.json({
          success: true,
          tables: result.content[0].text
        });
        
      } catch (error) {
        console.error('❌ Error obteniendo tablas:', error.message);
        res.status(500).json({
          error: 'Error obteniendo tablas',
          code: 'TABLES_ERROR'
        });
      }
    });

    // Ruta para describir una tabla
    this.app.get('/api/tables/:tableName', async (req, res) => {
      try {
        const { tableName } = req.params;
        const result = await this.mcpClient.describeTable(tableName);
        
        res.json({
          success: true,
          tableDescription: result.content[0].text
        });
        
      } catch (error) {
        console.error('❌ Error describiendo tabla:', error.message);
        res.status(500).json({
          error: 'Error describiendo tabla',
          code: 'TABLE_DESCRIPTION_ERROR'
        });
      }
    });

    // Ruta 404
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint no encontrado',
        path: req.originalUrl,
        method: req.method,
        code: 'NOT_FOUND'
      });
    });
  }

  async start() {
    try {
      await this.initialize();
      
      this.server = this.app.listen(this.port, () => {
        console.log(`🚀 Servidor MCP Backend iniciado en puerto ${this.port}`);
        console.log(`📍 Health check: http://localhost:${this.port}/health`);
        console.log(`📍 API Info: http://localhost:${this.port}/info`);
        console.log(`📍 Chat endpoint: http://localhost:${this.port}/api/chat`);
        console.log(`📍 Tables endpoint: http://localhost:${this.port}/api/tables`);
        console.log('');
        console.log('🧪 MODO DE PRUEBA - Sin autenticación OAuth2');
        console.log('💡 Puedes probar con: curl -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" -d "{\"message\":\"¿Qué tablas hay?\"}"');
      });

    } catch (error) {
      console.error('❌ Error iniciando servidor:', error.message);
      process.exit(1);
    }
  }
}

// Iniciar servidor
const server = new MCPServer();
server.start().catch(error => {
  console.error('❌ Error fatal:', error.message);
  process.exit(1);
});

export default MCPServer;
