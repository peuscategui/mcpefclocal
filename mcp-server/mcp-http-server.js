// Servidor MCP HTTP para conexiones remotas
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import sql from 'mssql';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

dotenv.config();

class MCPHTTPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'mcp-sql-server-http',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  async connectToDatabase() {
    try {
      const config = {
        server: '192.168.2.18', // IP de la base de datos
        port: 1433,
        database: 'PRUEBA_MCP',
        user: 'MCP',
        password: 'm_25_9e_pe1_',
        options: {
          encrypt: true,
          trustServerCertificate: true,
          enableArithAbort: true,
          useUTC: false,
          connectionTimeout: 30000,
          requestTimeout: 30000,
        },
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000,
        },
      };

      this.pool = await sql.connect(config);
      console.log('✅ Conectado a Microsoft SQL Server');
    } catch (error) {
      console.error('❌ Error conectando a la base de datos:', error);
      throw error;
    }
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_tables',
            description: 'Obtiene la lista de todas las tablas en la base de datos',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'describe_table',
            description: 'Describe la estructura de una tabla específica',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: 'Nombre de la tabla a describir',
                },
              },
              required: ['tableName'],
            },
          },
          {
            name: 'execute_query',
            description: 'Ejecuta una consulta SQL en la base de datos',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Consulta SQL a ejecutar',
                },
              },
              required: ['query'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_tables':
            return await this.getTables();
          case 'describe_table':
            return await this.describeTable(args.tableName);
          case 'execute_query':
            return await this.executeQuery(args.query);
          default:
            throw new Error(`Herramienta desconocida: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error ejecutando ${name}: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async getTables() {
    const result = await this.pool.request().query(`
      SELECT 
        TABLE_SCHEMA as schema_name,
        TABLE_NAME as table_name,
        TABLE_TYPE as table_type
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);

    const tables = result.recordset.map(row => 
      `📋 **${row.schema_name}.${row.table_name}** (${row.table_type})`
    ).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `🗄️ **Tablas en la base de datos:**\n\n${tables}\n\n📊 Total: ${result.recordset.length} tablas`,
        },
      ],
    };
  }

  async describeTable(tableName) {
    const result = await this.pool.request()
      .input('tableName', sql.NVarChar, tableName)
      .query(`
        SELECT 
          COLUMN_NAME as column_name,
          DATA_TYPE as data_type,
          CHARACTER_MAXIMUM_LENGTH as max_length,
          IS_NULLABLE as is_nullable,
          COLUMN_DEFAULT as default_value
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = @tableName
        ORDER BY ORDINAL_POSITION
      `);

    if (result.recordset.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Tabla '${tableName}' no encontrada`,
          },
        ],
      };
    }

    const columns = result.recordset.map(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const length = col.max_length ? `(${col.max_length})` : '';
      const defaultValue = col.default_value ? ` DEFAULT ${col.default_value}` : '';
      
      return `  • **${col.column_name}**: ${col.data_type}${length} ${nullable}${defaultValue}`;
    }).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `📋 **Estructura de la tabla '${tableName}':**\n\n${columns}\n\n📊 Total: ${result.recordset.length} columnas`,
        },
      ],
    };
  }

  async executeQuery(query) {
    const result = await this.pool.request().query(query);
    
    if (result.recordset.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `✅ Consulta ejecutada exitosamente.\n📊 Filas afectadas: ${result.rowsAffected[0] || 0}`,
          },
        ],
      };
    }

    // Formatear resultados como tabla
    const headers = Object.keys(result.recordset[0]);
    const rows = result.recordset.map(row => 
      headers.map(header => row[header] || 'NULL').join(' | ')
    );

    const table = [
      headers.join(' | '),
      headers.map(() => '---').join(' | '),
      ...rows
    ].join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `✅ **Resultados de la consulta:**\n\n${table}\n\n📊 Total: ${result.recordset.length} filas`,
        },
      ],
    };
  }

  async start() {
    try {
      await this.connectToDatabase();
      
      const app = express();
      const port = process.env.MCP_PORT || 3000;
      
      // Middleware
      app.use(cors());
      app.use(express.json());
      
      // Health check endpoint
      app.get('/health', (req, res) => {
        res.json({ 
          status: 'ok', 
          message: 'MCP SQL Server HTTP is running',
          timestamp: new Date().toISOString()
        });
      });
      
      // MCP endpoint
      app.post('/mcp', async (req, res) => {
        try {
          const { method, params } = req.body;
          
          if (method === 'tools/list') {
            const result = await this.server.request({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/list',
              params: {}
            });
            res.json(result);
          } else if (method === 'tools/call') {
            const result = await this.server.request({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/call',
              params: params
            });
            res.json(result);
          } else {
            res.status(400).json({ error: 'Method not supported' });
          }
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      });
      
      app.listen(port, () => {
        console.log(`🚀 Servidor MCP HTTP iniciado en puerto ${port}`);
        console.log(`📍 Health check: http://localhost:${port}/health`);
        console.log(`📍 MCP endpoint: http://localhost:${port}/mcp`);
      });
      
    } catch (error) {
      console.error('Error iniciando el servidor:', error);
      process.exit(1);
    }
  }
}

// Manejo de señales para cierre limpio
process.on('SIGINT', async () => {
  console.log('Cerrando servidor MCP HTTP...');
  if (sql) {
    await sql.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Cerrando servidor MCP HTTP...');
  if (sql) {
    await sql.close();
  }
  process.exit(0);
});

// Iniciar el servidor
const mcpServer = new MCPHTTPServer();
mcpServer.start().catch(console.error);
