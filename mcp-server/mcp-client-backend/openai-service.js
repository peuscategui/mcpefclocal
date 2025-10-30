// openai-service.js
import OpenAI from 'openai';
import MCPClient from './mcp-client.js';

class OpenAIService {
  constructor(mcpClient = null, dbService = null) {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY 
    });
    this.model = 'gpt-4-turbo-preview';
    this.mcpClient = mcpClient;
    this.dbService = dbService;
  }

  async getMCPClient() {
    if (!this.mcpClient) {
      console.warn('��ᴩ� OpenAIService: No hay MCPClient inyectado, creando uno nuevo');
      this.mcpClient = new MCPClient(
        process.env.MCP_HOST || 'localhost',
        process.env.MCP_PORT || 3000
      );
      await this.mcpClient.connect();
    }
    return this.mcpClient;
  }

  /**
   * Obtener prompt desde BD o usar fallback hardcodeado
   * @param {string} promptType - Tipo de prompt ('analysis', 'sql_generation')
   * @param {string} userProfile - Perfil de usuario (opcional)
   * @returns {Promise<string>} Contenido del prompt
   */
  async getPromptFromDB(promptType, userProfile = null) {
    try {
      // Verificar si hay servicio de BD disponible
      if (this.dbService && this.dbService.isConnected && this.dbService.promptService) {
        console.log(`���� Buscando prompt tipo='${promptType}', perfil='${userProfile}' en BD...`);
        
        const content = await this.dbService.promptService.getActivePrompt(promptType, userProfile);
        
        if (content) {
          console.log(`ԣ� Prompt cargado desde BD (${content.length} caracteres)`);
          return content;
        } else {
          console.warn(`��ᴩ� No se encontr+� prompt activo en BD, usando fallback hardcodeado`);
        }
      } else {
        console.warn('��ᴩ� Servicio de BD no disponible, usando prompt hardcodeado');
      }
    } catch (error) {
      console.error('��� Error cargando prompt desde BD:', error.message);
      console.warn('��ᴩ� Usando prompt hardcodeado como fallback');
    }
    
    return this.getDefaultPrompt();
  }

  /**
   * Prompt por defecto (fallback) - SOLO para emergencias
   * ⚠️ Este prompt NO debería usarse en producción normal.
   * Las reglas de negocio deben estar en la BD (CAPA 3).
   * 
   * @returns {string} Prompt mínimo de emergencia
   */
  getDefaultPrompt() {
    return `⚠️ ADVERTENCIA: No se pudieron cargar las reglas de negocio desde la base de datos.

Por favor, ejecuta el script: node insert-initial-prompt.js

Mientras tanto, funcionamiento básico:
- Eres un analista comercial que ayuda a analizar datos de ventas y rentabilidad.
- Genera SQL válido para SQL Server usando las tablas y columnas del esquema proporcionado.
- Responde en español de forma clara y concisa.`;
  }

  getMCPTools() {
    return [
      {
        type: 'function',
        function: {
        name: 'get_tables',
          description: 'Lista todas las tablas disponibles en la base de datos',
        parameters: {
          type: 'object',
          properties: {},
          required: []
          }
        }
      },
      {
        type: 'function',
        function: {
        name: 'describe_table',
          description: 'Describe la estructura completa de una tabla',
        parameters: {
          type: 'object',
          properties: {
            table_name: {
              type: 'string',
                description: 'Nombre de la tabla'
            }
          },
          required: ['table_name']
          }
        }
      },
      {
        type: 'function',
        function: {
        name: 'execute_query',
          description: 'Ejecuta una consulta SQL SELECT',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
                description: 'Consulta SQL SELECT v+�lida'
            },
            params: {
              type: 'object',
                description: 'Par+�metros opcionales',
                default: {}
            }
          },
          required: ['query']
          }
        }
      }
    ];
  }

  async chat(userMessage, conversationHistory = [], options = {}) {
    const mcpClient = await this.getMCPClient();
    
    // Opciones por defecto
    const {
      temperature = 0.1,
      model = this.model,
      systemPromptOverride = null,
      toolsEnabled = true
    } = options;

    // Obtener contexto del MCP server (solo la primera vez)
    let systemPrompt;
    
    // Si hay un system prompt override, usarlo
    if (systemPromptOverride) {
      systemPrompt = {
        role: 'system',
        content: systemPromptOverride
      };
    } else if (conversationHistory.length === 0) {
      console.log('📊 Construyendo prompt con arquitectura de 3 capas...');
      
      try {
        // 🔷 CAPA 1 + 2: Obtener ESQUEMA DINÁMICO + REGLAS SQL del MCP Server
        const promptResponse = await mcpClient.getPrompt('sql_assistant', {
          task: 'analysis'
        });
        const esquemaDinamicoConReglas = promptResponse.messages[0].content.text;
        console.log('✅ Capa 1+2: Esquema dinámico + Reglas SQL cargadas del MCP');
        
        // 🔷 CAPA 3: Obtener REGLAS DE NEGOCIO desde BD (o fallback)
        let reglasNegocio;
        try {
          reglasNegocio = await this.getPromptFromDB('analysis', null);
          console.log('✅ Capa 3a: Reglas de negocio (análisis) cargadas desde BD');
        } catch (error) {
          console.error('❌ ERROR CRÍTICO: No se pudieron cargar reglas de negocio desde BD:', error.message);
          console.error('⚠️ Las reglas de negocio DEBEN estar en la BD (CAPA 3). Ejecuta: node insert-initial-prompt.js');
          console.warn('⚠️ Usando prompt mínimo de emergencia (NO RECOMENDADO para producción)');
          reglasNegocio = this.getDefaultPrompt();
        }
        
        // 🔷 CAPA 3b: Obtener REGLAS SQL DE NEGOCIO (comparación justa, etc.)
        let reglasSQLNegocio = '';
        try {
          const sqlRules = await this.getPromptFromDB('sql_rules', null);
          if (sqlRules && sqlRules.trim()) {
            reglasSQLNegocio = sqlRules;
            console.log('✅ Capa 3b: Reglas SQL de negocio (comparación justa) cargadas desde BD');
          } else {
            console.log('ℹ️ No hay reglas SQL de negocio configuradas en BD');
          }
        } catch (error) {
          console.warn('⚠️ No se pudieron cargar reglas SQL de negocio:', error.message);
          // No es crítico, puede continuar sin ellas
        }
        
        // 🔷 COMBINAR las 3 capas + reglas SQL de negocio
        let promptCompleto = `${esquemaDinamicoConReglas}

════════════════════════════════════════════════════════════════
=== 📊 REGLAS DE NEGOCIO Y ANÁLISIS COMERCIAL ===
════════════════════════════════════════════════════════════════

${reglasNegocio}`;

        // Agregar reglas SQL de negocio si existen
        if (reglasSQLNegocio && reglasSQLNegocio.trim()) {
          promptCompleto += `

════════════════════════════════════════════════════════════════
=== ⚡ REGLAS SQL DE NEGOCIO (EDITABLES) ===
════════════════════════════════════════════════════════════════

${reglasSQLNegocio}`;
        }

        promptCompleto += `

════════════════════════════════════════════════════════════════
⚠️ CRÍTICO: Usa SOLO las columnas listadas en el esquema de arriba.
Si una columna NO está en la lista, NO EXISTE en la base de datos.
════════════════════════════════════════════════════════════════`;
        
        systemPrompt = {
          role: 'system',
          content: promptCompleto
        };
        
        const capasUsadas = ['CAPA 1: Esquema', 'CAPA 2: Reglas SQL técnicas'];
        if (reglasNegocio) capasUsadas.push('CAPA 3a: Reglas de negocio');
        if (reglasSQLNegocio) capasUsadas.push('CAPA 3b: Reglas SQL de negocio (EDITABLE)');
        console.log(`✅ Prompt combinado: ${capasUsadas.join(' + ')}`);
        
    } catch (error) {
        console.error('❌ ERROR CRÍTICO construyendo prompt:', error.message);
        console.error('⚠️ Las reglas de negocio DEBEN estar en la BD (CAPA 3). Ejecuta: node insert-initial-prompt.js');
        console.warn('⚠️ Usando prompt mínimo de emergencia (NO RECOMENDADO para producción)');
        
        // Fallback: Prompt mínimo de emergencia
        systemPrompt = {
          role: 'system',
          content: this.getDefaultPrompt()
        };
      }
    }

    const messages = systemPrompt 
      ? [systemPrompt, ...conversationHistory, { role: 'user', content: userMessage }]
      : [...conversationHistory, { role: 'user', content: userMessage }];

    console.log(`\n💬 Usuario: ${userMessage}`);

    // Primera llamada a OpenAI
    const firstCallParams = {
      model: model,
      messages: messages,
      temperature: temperature
    };
    
    // Solo incluir tools si están habilitados
    if (toolsEnabled) {
      firstCallParams.tools = this.getMCPTools();
      firstCallParams.tool_choice = 'auto';
    }
    
    let response = await this.client.chat.completions.create(firstCallParams);

    let assistantMessage = response.choices[0].message;
    
    // Loop para manejar tool calls
    let maxIterations = 5;
    let iteration = 0;

    while (toolsEnabled && assistantMessage.tool_calls && iteration < maxIterations) {
      iteration++;
      console.log(`\n🔄 Iteración ${iteration} - ${assistantMessage.tool_calls.length} herramienta(s)`);

      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`🔧 Ejecutando: ${functionName}`);
        console.log(`   Argumentos:`, functionArgs);

        let toolResult;
        try {
          toolResult = await this.executeMCPTool(mcpClient, functionName, functionArgs);
          
          // Mostrar preview del resultado
          const resultStr = JSON.stringify(toolResult);
          const preview = resultStr.length > 200 
            ? resultStr.substring(0, 200) + '...' 
            : resultStr;
          console.log(`   ✅ Resultado:`, preview);
          
        } catch (error) {
          console.error(`   ❌ Error:`, error.message);
          toolResult = { 
            error: error.message,
            hint: 'Verifica que la consulta SQL use los nombres de columnas correctos'
          };
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: functionName,
          content: JSON.stringify(toolResult, null, 2)
        });
      }

      // Siguiente llamada a OpenAI
      const nextCallParams = {
        model: model,
        messages: messages,
        temperature: temperature
      };
      
      // Solo incluir tools si están habilitados
      if (toolsEnabled) {
        nextCallParams.tools = this.getMCPTools();
        nextCallParams.tool_choice = 'auto';
      }
      
      response = await this.client.chat.completions.create(nextCallParams);

      assistantMessage = response.choices[0].message;
    }

    console.log(`\n🤖 Asistente: ${assistantMessage.content}\n`);

    return {
      type: 'text',
      content: assistantMessage.content,
      conversationHistory: messages.filter(m => m.role !== 'system')
    };
  }

  async executeMCPTool(mcpClient, toolName, args) {
    switch(toolName) {
      case 'get_tables':
        return await mcpClient.getTables();
        
      case 'describe_table':
        return await mcpClient.describeTable(args.table_name);
        
      case 'execute_query':
        return await mcpClient.executeQuery(args.query, args.params || {});
        
      default:
        throw new Error(`Herramienta desconocida: ${toolName}`);
    }
  }

  async close() {
    if (this.mcpClient) {
      await this.mcpClient.disconnect();
    }
  }
}

export default OpenAIService;
