import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import sql from 'mssql';
import dotenv from 'dotenv';
import net from 'net';

// Cargar variables de entorno
dotenv.config();

class DatabaseMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: "database-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
          resources: {}
        },
      }
    );
    
    // ⚠️ IMPORTANTE: Configura tu base de datos aquí
    this.dbConfig = {
      server: process.env.DB_SERVER || '192.168.2.18',
      database: process.env.DB_NAME || 'PRUEBA_MCP',
      user: process.env.DB_USER || 'MCP',
      password: process.env.DB_PASSWORD || 'm_25_9e_pe1_',
      options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true
      }
    };
    
    this.setupHandlers();
  }

  setupHandlers() {
    this.setupToolHandlers();
    this.setupPromptHandlers();
    this.setupResourceHandlers();
  }

  // ============ TOOLS ============
  setupToolHandlers() {
    // Listar herramientas disponibles
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error('📋 Listando herramientas disponibles');
      return {
        tools: [
          {
            name: "get_tables",
            description: "Lista todas las tablas disponibles en la base de datos",
            inputSchema: {
              type: "object",
              properties: {},
              required: []
            }
          },
          {
            name: "describe_table",
            description: "Describe la estructura completa de una tabla específica",
            inputSchema: {
              type: "object",
              properties: {
                table_name: {
                  type: "string",
                  description: "Nombre exacto de la tabla a describir"
                }
              },
              required: ["table_name"]
            }
          },
          {
            name: "execute_query",
            description: "Ejecuta una consulta SQL SELECT en la base de datos",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Consulta SQL SELECT válida"
                },
                params: {
                  type: "object",
                  description: "Parámetros opcionales para la consulta parametrizada",
                  default: {}
                }
              },
              required: ["query"]
            }
          }
        ]
      };
    });

    // Ejecutar herramientas
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      console.error(`🔧 Ejecutando herramienta: ${name}`);

      try {
        const pool = await sql.connect(this.dbConfig);

        switch (name) {
          case "get_tables": {
            console.error('📊 Obteniendo lista de tablas...');
            const tables = await pool.request().query(`
              SELECT TABLE_NAME, TABLE_TYPE
              FROM INFORMATION_SCHEMA.TABLES 
              WHERE TABLE_TYPE = 'BASE TABLE'
              ORDER BY TABLE_NAME
            `);
            
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(tables.recordset, null, 2)
                }
              ]
            };
          }

          case "describe_table": {
            console.error(`📋 Describiendo tabla: ${args.table_name}`);
            const columns = await pool.request()
              .input('tableName', sql.NVarChar, args.table_name)
              .query(`
                SELECT 
                  COLUMN_NAME,
                  DATA_TYPE,
                  IS_NULLABLE,
                  CHARACTER_MAXIMUM_LENGTH,
                  NUMERIC_PRECISION,
                  NUMERIC_SCALE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = @tableName
                ORDER BY ORDINAL_POSITION
              `);

            if (columns.recordset.length === 0) {
              throw new Error(`Tabla '${args.table_name}' no encontrada`);
            }
            
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    table: args.table_name,
                    columns: columns.recordset
                  }, null, 2)
                }
              ]
            };
          }

          case "execute_query": {
            console.error(`💾 Ejecutando query: ${args.query.substring(0, 100)}...`);
            
            // Validar que sea un SELECT
            if (!args.query.trim().toUpperCase().startsWith('SELECT')) {
              throw new Error('Solo se permiten consultas SELECT');
            }

            const result = await pool.request().query(args.query);
            
            console.error(`✅ Query ejecutada. Filas retornadas: ${result.recordset.length}`);
            
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    rowCount: result.recordset.length,
                    data: result.recordset
                  }, null, 2)
                }
              ]
            };
          }

          default:
            throw new Error(`Herramienta desconocida: ${name}`);
        }
      } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ 
                error: error.message,
                details: error.stack 
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });
  }

  // ============ PROMPTS ============
  setupPromptHandlers() {
    // Listar prompts disponibles
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      console.error('📝 Listando prompts disponibles');
      return {
        prompts: [
          {
            name: "sql_assistant",
            description: "Contexto completo de la base de datos para asistir en consultas SQL",
            arguments: [
              {
                name: "task",
                description: "Tipo de tarea: 'analysis' (análisis), 'reporting' (reportes), 'general'",
                required: false
              }
            ]
          }
        ]
      };
    });

    // Obtener un prompt específico
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      console.error(`📝 Obteniendo prompt: ${request.params.name}`);
      
      if (request.params.name === "sql_assistant") {
        const schema = await this.getDatabaseSchema();
        const task = request.params.arguments?.task || "general";

        console.error(`✅ Prompt generado con ${schema.length} tablas`);

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: this.buildPromptText(schema, task)
              }
            }
          ]
        };
      }
      
      throw new Error(`Prompt no encontrado: ${request.params.name}`);
    });
  }

  // Construir el texto del prompt dinámicamente
  buildPromptText(schema, task) {
    let prompt = `Eres un asistente experto en SQL Server para análisis de datos comerciales.

=== ESTRUCTURA DE LA BASE DE DATOS ===

Tienes acceso a las siguientes tablas:\n\n`;

    schema.forEach(table => {
      prompt += `📊 Tabla: ${table.name}\n`;
      prompt += `Columnas:\n`;
      
      table.columns.forEach(col => {
        prompt += `  • ${col.name} (${col.type}`;
        if (col.maxLength && col.maxLength > 0) {
          prompt += `(${col.maxLength})`;
        }
        prompt += `) - ${col.nullable ? 'NULL' : 'NOT NULL'}`;
        
        // Agregar hints útiles
        if (col.name.toLowerCase().includes('fecha') || col.name.toLowerCase().includes('date')) {
          prompt += ` [📅 usa YEAR(), MONTH(), DAY()]`;
        }
        if (col.name.toLowerCase().includes('total') || col.name.toLowerCase().includes('monto') || col.name.toLowerCase().includes('precio')) {
          prompt += ` [💰 usa SUM(), AVG()]`;
        }
        
        prompt += `\n`;
      });
      prompt += `\n`;
    });

    prompt += `=== REGLAS CRÍTICAS ===

1. ⚠️ USA EXCLUSIVAMENTE los nombres de columnas listados arriba
2. ❌ NUNCA inventes columnas como: 'año', 'monto', 'year', 'amount', 'ventas'
3. ✅ Para fechas en SQL Server:
   - Filtrar por año: WHERE YEAR(columna_fecha) = 2025
   - Agrupar por mes: GROUP BY YEAR(columna_fecha), MONTH(columna_fecha)
   - Formato: CONVERT(VARCHAR, fecha, 103) para DD/MM/YYYY
4. 📊 Siempre usa TOP 100 para limitar resultados
5. 🔤 Usa alias en español para las columnas del resultado
6. 📈 Para agregaciones: SUM(), AVG(), COUNT(), MIN(), MAX()

=== SINTAXIS SQL SERVER ===

✅ CORRECTO:
SELECT TOP 100
    YEAR(fecha) as Año,
    MONTH(fecha) as Mes,
    SUM(total) as TotalVentas,
    COUNT(*) as CantidadTransacciones
FROM MiTabla
WHERE YEAR(fecha) = 2025
GROUP BY YEAR(fecha), MONTH(fecha)
ORDER BY Año, Mes

❌ INCORRECTO:
SELECT año, SUM(monto) as ventas  -- Columnas inventadas
FROM MiTabla
WHERE year = 2025  -- Sintaxis incorrecta
`;

    // Contexto específico según la tarea
    if (task === "analysis") {
      prompt += `\n=== MODO: ANÁLISIS DE DATOS ===
Enfócate en:
- Identificar tendencias temporales
- Comparaciones entre períodos
- Análisis de crecimiento
- Detección de patrones
`;
    } else if (task === "reporting") {
      prompt += `\n=== MODO: REPORTES ===
Enfócate en:
- Datos agregados y resumidos
- Formato claro para presentación
- Totales y subtotales
- Información ejecutiva
`;
    }

    return prompt;
  }

  // ============ RESOURCES ============
  setupResourceHandlers() {
    // Listar recursos disponibles
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      console.error('📦 Listando recursos disponibles');
      return {
        resources: [
          {
            uri: "database://schema/all",
            name: "Complete Database Schema",
            description: "Esquema completo JSON de todas las tablas y columnas",
            mimeType: "application/json"
          },
          {
            uri: "database://schema/tables",
            name: "Tables List",
            description: "Lista simple de nombres de tablas disponibles",
            mimeType: "application/json"
          }
        ]
      };
    });

    // Leer un recurso específico
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      console.error(`📦 Leyendo recurso: ${uri}`);

      if (uri === "database://schema/all") {
        const schema = await this.getDatabaseSchema();
        return {
          contents: [
            {
              uri: uri,
              mimeType: "application/json",
              text: JSON.stringify(schema, null, 2)
            }
          ]
        };
      }

      if (uri === "database://schema/tables") {
        const pool = await sql.connect(this.dbConfig);
        const tables = await pool.request().query(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_TYPE = 'BASE TABLE'
          ORDER BY TABLE_NAME
        `);
        return {
          contents: [
            {
              uri: uri,
              mimeType: "application/json",
              text: JSON.stringify(tables.recordset, null, 2)
            }
          ]
        };
      }

      throw new Error(`Recurso no encontrado: ${uri}`);
    });
  }

  // Obtener esquema completo de la base de datos
  async getDatabaseSchema() {
    console.error('🔍 Obteniendo esquema de la base de datos...');
    
    try {
      const pool = await sql.connect(this.dbConfig);
      
      const result = await pool.request().query(`
        SELECT 
          t.TABLE_NAME,
          c.COLUMN_NAME,
          c.DATA_TYPE,
          c.CHARACTER_MAXIMUM_LENGTH,
          c.NUMERIC_PRECISION,
          c.NUMERIC_SCALE,
          c.IS_NULLABLE,
          c.ORDINAL_POSITION
        FROM INFORMATION_SCHEMA.TABLES t
        JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME
        WHERE t.TABLE_TYPE = 'BASE TABLE'
        ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION
      `);

      // Agrupar por tabla
      const tables = {};
      result.recordset.forEach(row => {
        if (!tables[row.TABLE_NAME]) {
          tables[row.TABLE_NAME] = {
            name: row.TABLE_NAME,
            columns: []
          };
        }
        
        tables[row.TABLE_NAME].columns.push({
          name: row.COLUMN_NAME,
          type: row.DATA_TYPE,
          maxLength: row.CHARACTER_MAXIMUM_LENGTH,
          precision: row.NUMERIC_PRECISION,
          scale: row.NUMERIC_SCALE,
          nullable: row.IS_NULLABLE === 'YES',
          position: row.ORDINAL_POSITION
        });
      });

      const schemaArray = Object.values(tables);
      console.error(`✅ Esquema obtenido: ${schemaArray.length} tablas`);
      
      return schemaArray;
    } catch (error) {
      console.error(`❌ Error obteniendo esquema: ${error.message}`);
      throw error;
    }
  }

  async run() {
    const port = process.env.MCP_PORT || 3000;
    const host = process.env.MCP_HOST || 'localhost';
    
    // Crear servidor TCP personalizado
    const tcpServer = net.createServer((socket) => {
      console.error(`🔌 Cliente conectado desde ${socket.remoteAddress}:${socket.remotePort}`);
      
      let buffer = '';
      
      socket.on('data', async (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Mantener línea incompleta
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              console.error(`📥 Mensaje recibido: ${message.method || 'unknown'}`);
              
              // Procesar mensaje con el servidor MCP
              const response = await this.processMessage(message);
              
              // Enviar respuesta
              socket.write(JSON.stringify(response) + '\n');
              console.error(`📤 Respuesta enviada`);
              
            } catch (error) {
              console.error(`❌ Error procesando mensaje: ${error.message}`);
              const errorResponse = {
                jsonrpc: '2.0',
                id: message?.id || null,
                error: {
                  code: -32603,
                  message: error.message
                }
              };
              socket.write(JSON.stringify(errorResponse) + '\n');
            }
          }
        }
      });
      
      socket.on('close', () => {
        console.error('🔌 Cliente desconectado');
      });
      
      socket.on('error', (error) => {
        console.error(`❌ Error de socket: ${error.message}`);
      });
    });
    
    tcpServer.listen(port, host, () => {
      console.error("✅ Database MCP Server iniciado correctamente");
      console.error(`📊 Base de datos: ${this.dbConfig.database} @ ${this.dbConfig.server}`);
      console.error(`🌐 Escuchando en ${host}:${port}`);
    });
    
    tcpServer.on('error', (error) => {
      console.error(`❌ Error del servidor TCP: ${error.message}`);
    });
  }
  
  async processMessage(message) {
    try {
      // Simular el procesamiento del servidor MCP
      switch (message.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: {
                tools: {},
                prompts: {},
                resources: {}
              },
              serverInfo: {
                name: 'database-mcp-server',
                version: '1.0.0'
              }
            }
          };
          
        case 'prompts/list':
          return {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              prompts: [
                {
                  name: "sql_assistant",
                  description: "Contexto completo de la base de datos para asistir en consultas SQL",
                  arguments: [
                    {
                      name: "task",
                      description: "Tipo de tarea: 'analysis' (análisis), 'reporting' (reportes), 'general'",
                      required: false
                    }
                  ]
                }
              ]
            }
          };
          
        case 'prompts/get':
          if (message.params.name === 'sql_assistant') {
            const schema = await this.getDatabaseSchema();
            const task = message.params.arguments?.task || 'general';
            const promptText = this.buildPromptText(schema, task);
            
            return {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                messages: [
                  {
                    role: "user",
                    content: {
                      type: "text",
                      text: promptText
                    }
                  }
                ]
              }
            };
          }
          throw new Error(`Prompt no encontrado: ${message.params.name}`);
          
        case 'resources/list':
          return {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              resources: [
                {
                  uri: "database://schema/all",
                  name: "Complete Database Schema",
                  description: "Esquema completo JSON de todas las tablas y columnas",
                  mimeType: "application/json"
                },
                {
                  uri: "database://schema/tables",
                  name: "Tables List",
                  description: "Lista simple de nombres de tablas disponibles",
                  mimeType: "application/json"
                }
              ]
            }
          };
          
        case 'resources/read':
          if (message.params.uri === "database://schema/all") {
            const schema = await this.getDatabaseSchema();
            return {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                contents: [
                  {
                    uri: message.params.uri,
                    mimeType: "application/json",
                    text: JSON.stringify(schema, null, 2)
                  }
                ]
              }
            };
          }
          throw new Error(`Recurso no encontrado: ${message.params.uri}`);
          
        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              tools: [
                {
                  name: "get_tables",
                  description: "Lista todas las tablas disponibles en la base de datos",
                  inputSchema: {
                    type: "object",
                    properties: {},
                    required: []
                  }
                },
                {
                  name: "describe_table",
                  description: "Describe la estructura completa de una tabla específica",
                  inputSchema: {
                    type: "object",
                    properties: {
                      table_name: {
                        type: "string",
                        description: "Nombre exacto de la tabla a describir"
                      }
                    },
                    required: ["table_name"]
                  }
                },
                {
                  name: "execute_query",
                  description: "Ejecuta una consulta SQL SELECT en la base de datos",
                  inputSchema: {
                    type: "object",
                    properties: {
                      query: {
                        type: "string",
                        description: "Consulta SQL SELECT válida"
                      },
                      params: {
                        type: "object",
                        description: "Parámetros opcionales para la consulta parametrizada",
                        default: {}
                      }
                    },
                    required: ["query"]
                  }
                }
              ]
            }
          };
          
        case 'tools/call':
          return await this.handleToolCall(message);
          
        default:
          throw new Error(`Método no soportado: ${message.method}`);
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32603,
          message: error.message
        }
      };
    }
  }
  
  async handleToolCall(message) {
    const { name, arguments: args } = message.params;
    console.error(`🔧 Ejecutando herramienta: ${name}`);

    try {
      const pool = await sql.connect(this.dbConfig);

      switch (name) {
        case "get_tables": {
          console.error('📊 Obteniendo lista de tablas...');
          const tables = await pool.request().query(`
            SELECT TABLE_NAME, TABLE_TYPE
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
          `);
          
          return {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(tables.recordset, null, 2)
                }
              ]
            }
          };
        }

        case "describe_table": {
          console.error(`📋 Describiendo tabla: ${args.table_name}`);
          const columns = await pool.request()
            .input('tableName', sql.NVarChar, args.table_name)
            .query(`
              SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                IS_NULLABLE,
                CHARACTER_MAXIMUM_LENGTH,
                NUMERIC_PRECISION,
                NUMERIC_SCALE
              FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_NAME = @tableName
              ORDER BY ORDINAL_POSITION
            `);

          if (columns.recordset.length === 0) {
            throw new Error(`Tabla '${args.table_name}' no encontrada`);
          }
          
          return {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    table: args.table_name,
                    columns: columns.recordset
                  }, null, 2)
                }
              ]
            }
          };
        }

        case "execute_query": {
          console.error(`💾 Ejecutando query: ${args.query.substring(0, 100)}...`);
          
          // Validar que sea un SELECT
          if (!args.query.trim().toUpperCase().startsWith('SELECT')) {
            throw new Error('Solo se permiten consultas SELECT');
          }

          const result = await pool.request().query(args.query);
          
          console.error(`✅ Query ejecutada. Filas retornadas: ${result.recordset.length}`);
          
          return {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    rowCount: result.recordset.length,
                    data: result.recordset
                  }, null, 2)
                }
              ]
            }
          };
        }

        default:
          throw new Error(`Herramienta desconocida: ${name}`);
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32603,
          message: error.message
        }
      };
    }
  }
}

// Iniciar el servidor
const server = new DatabaseMCPServer();
server.run().catch((error) => {
  console.error("❌ Error fatal:", error);
  process.exit(1);
});
