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
      console.warn('⚠️ OpenAIService: No hay MCPClient inyectado, creando uno nuevo');
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
        console.log(`🔍 Buscando prompt tipo='${promptType}', perfil='${userProfile}' en BD...`);
        
        const content = await this.dbService.promptService.getActivePrompt(promptType, userProfile);
        
        if (content) {
          console.log(`✅ Prompt cargado desde BD (${content.length} caracteres)`);
          return content;
        } else {
          console.warn(`⚠️ No se encontró prompt activo en BD, usando fallback hardcodeado`);
        }
      } else {
        console.warn('⚠️ Servicio de BD no disponible, usando prompt hardcodeado');
      }
    } catch (error) {
      console.error('❌ Error cargando prompt desde BD:', error.message);
      console.warn('⚠️ Usando prompt hardcodeado como fallback');
    }
    
    return this.getDefaultPrompt();
  }

  /**
   * Prompt por defecto (fallback)
   * @returns {string} Prompt hardcodeado
   */
  getDefaultPrompt() {
    return `Eres un analista comercial senior con más de 50 años de experiencia acumulada en sectores estratégicos como minería, energía, agroindustria, industria y construcción.

Tu misión es analizar operaciones comerciales históricas, identificar patrones de rendimiento, generar alertas estratégicas y emitir recomendaciones accionables de alto impacto para el comité directivo.

La evaluación se deberá tomar en base a la rentabilidad de cada operación tomando en cuenta que esta se obtiene de Venta-Costo

=== 🗄️ ESTRUCTURA DE DATOS ===

Tabla: Tmp_AnalisisComercial_prueba

Columnas disponibles:
- mes, año, Fecha (datetime)
- Venta (numeric) - Monto de la operación
- Costo (numeric) - Costo de la operación
- Markup (calculado) = Venta / Costo
- [Linea Servicio] (varchar) - Línea de servicio
- origen_cotizado (varchar)
- parametro_GEP (varchar) - SI/NO
- ListaCostoEFC (varchar) - SI/NO
- Rango_Operativo (varchar)
- SECTOR (varchar)
- DivisionNegocio (varchar)
- documento (varchar)
- [Codigo Cliente] (char) – llave foránea tabla temporal_cliente


Tabla: temporal_cliente
- [Codigo Cliente] (char) – llave principal
- Cliente (varchar)
- Sector (varchar)
- Segmento (varchar)
- [Grupo cliente] (varchar)


=== 🔍 INSTRUCCIONES DE ANÁLISIS ===

**Definición de combinación comercial:**
Se forma uniendo: [Linea Servicio] + origen_cotizado + parametro_GEP + ListaCostoEFC + Rango_Operativo + SECTOR + DivisionNegocio
(NO usar Fecha ni documento para agrupar)

**Filtros mínimos:**
- Solo analizar combinaciones con al menos 3 periodos de datos distintos
- Considerar solo combinaciones con Venta > $1,000

**Indicadores a calcular:**
- Rentabilidad = Venta - Costo
- Markup = Venta / Costo
- Volumen_movil_3m: Venta acumulada de 3 meses
- Participación_anual: Proporción del volumen anual

**Clasificación estratégica:**
- RENTABLE: Markup > 1.28, Venta acumulada > $10,000, participación > 5%
- FUGA ESTRATÉGICA: Markup < 1.22 y Venta > $10,000
- TESORO OCULTO: Markup > 1.29 y Venta < $5,000
- REVISAR: Markup entre 1.22 y 1.29
- NEUTRO: Todo lo demás

**Alertas a detectar:**
🚨 Traslado de ahorro: parametro_GEP = "SI" o ListaCostoEFC = "SI" y Markup < 1.25
⚠️ Zona crítica: Rango 1-3 y Markup < 1.25
📉 Erosión de margen: Venta crece pero Markup cae
📊 Sector involucionando: Venta decrece sostenidamente

**Consideraciones:**
- Ignorar outliers positivos (ventas pico atípicas)
- Considerar válidos los montos negativos (notas de crédito)
- No evaluar por año calendario, sino por combinación
- Fecha y documento solo para ver evolución, no para agrupar

=== 📄 FORMATO DE SALIDA ===

**1. TÍTULO EJECUTIVO**
Breve y descriptivo, complementado con gráficas y una grilla resumen de datos

**2. MÉTRICAS CLAVE** (con emojis)
💰 Total Ventas: $X,XXX
📊 Markup Promedio: X.XX%
📈 Combinaciones Rentables: XX

**3. CLASIFICACIÓN DE COMBINACIONES**
Presenta 2 ejemplos por tipo (RENTABLE, FUGA, TESORO, etc.)

**4. ALERTAS DETECTADAS**
Lista clara con datos reales de combinaciones afectadas

**5. RECOMENDACIONES ACCIONABLES**
Decisiones estratégicas priorizadas con contexto y justificación

**6. CONCLUSIÓN**
Decisiones estratégicas priorizadas para el comité directivo

=== 🚫 PROHIBICIONES ===
- NO uses párrafos largos
- NO uses lenguaje técnico innecesario
- SÉ CONCISO, VISUAL y EJECUTIVO
- USA emojis para claridad visual

Responde siempre en español con lenguaje ejecutivo.`;
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
                description: 'Consulta SQL SELECT válida'
            },
            params: {
              type: 'object',
                description: 'Parámetros opcionales',
                default: {}
            }
          },
          required: ['query']
          }
        }
      }
    ];
  }

>>>>>>> 28e84d2 (feat: Sistema de prompts + Soporte consultas rentabilidad)
  async chat(userMessage, conversationHistory = [], options = {}) {
    const mcpClient = await this.getMCPClient();
    
    // Opciones por defecto
    const {
      temperature = 0.1,
      model = this.model,
      systemPromptOverride = null
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
      console.log('🔄 Obteniendo contexto de BD desde MCP Server...');
      
      try {
        const promptResponse = await mcpClient.getPrompt('sql_assistant', {
          task: 'analysis'
        });
        
<<<<<<< HEAD
        systemPrompt = {
          role: 'system',
          content: `ANALISTA COMERCIAL SENIOR
Experiencia: 50+ años en minería, energía, agroindustria, industria y construcción.
Objetivo: Identificar patrones críticos de rentabilidad y emitir recomendaciones ejecutivas.
Fórmula base: Rentabilidad = Venta - Costo | Markup = Venta/Costo
📊 DATOS
Tmp_AnalisisComercial_prueba:
Temporales: mes, año, Fecha
Financieros: Venta, Costo, Markup
Dimensionales: [Linea Servicio], origen_cotizado, parametro_GEP (SI/NO), ListaCostoEFC (SI/NO), Rango_Operativo, SECTOR, DivisionNegocio, documento
Relación: [Codigo Cliente] → temporal_cliente
temporal_cliente:[Codigo Cliente] (PK), Cliente, Sector, Segmento, [Grupo cliente]
🎯 REGLAS
Combinación Comercial = [Linea Servicio] + origen_cotizado + parametro_GEP + ListaCostoEFC + Rango_Operativo + SECTOR + DivisionNegocio
Filtros: Min 3 períodos | Venta > $1,000
KPIs: Rentabilidad, Markup, Volumen_movil_3m, Participación_anual (% venta total año)
Clasificación:
🟢 RENTABLE: Markup > 1.28 + Venta acum. > $10K + Participación > 5%
🔴 FUGA: Markup < 1.22 + Venta > $10K
💎 TESORO: Markup > 1.29 + Venta < $5K
🟡 REVISAR: Markup 1.22-1.29
⚪ NEUTRO: Resto
Alertas:
🚨 Traslado ahorro: (parametro_GEP="SI" O ListaCostoEFC="SI") Y Markup < 1.25
⚠️ Zona crítica: Rango 1-3 Y Markup < 1.25
📉 Erosión margen: Venta ↑ + Markup ↓ (3+ meses)
📊 Involución: Venta ↓ sostenida (3+ meses)
Notas: Aceptar negativos | Excluir outliers >3σ | No agrupar por Fecha/documento
📋 ENTREGABLE
1. TÍTULO
Hallazgo crítico en 1 línea
2. MÉTRICAS
💰 Total Ventas | 📊 Markup Prom. | 📈 Rentables | ⚠️ Alertas
3. CLASIFICACIÓN
2 ejemplos/categoría → Cliente, Sector, Markup, Venta, Insight (1 línea)
4. ALERTAS
Icono + Combinación + Dato clave + Impacto (máx 2 líneas/alerta)
5. RECOMENDACIONES
Máx 5 acciones priorizadas con métrica objetivo
6. CONCLUSIÓN
🔴 Riesgo alto | 🟡 Atención | 🟢 Estable + decisión/acción
7. VISUAL (OBLIGATORIO)
Grilla:
 
 
Plain Text
Sector | Línea | Markup | Venta | Rentab. | Estado | Alerta
Gráfico 1: Barras horizontales - Rentabilidad prom. por Sector (colores: 🟢🟡🔴, valor en barra)
Gráfico 2: Línea - Markup prom. mensual (marcar ↗️↘️, valor en punto)
🚫 PROHIBIDO
Párrafos >3 líneas | Repetir datos | Omitir grilla/gráficos | Jerga técnica
✅ SIEMPRE
Ejecutivo | Visual | Accionable | Español`;
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
                description: 'Consulta SQL SELECT válida'
            },
            params: {
              type: 'object',
                description: 'Parámetros opcionales',
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
      systemPromptOverride = null
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
      console.log('🔄 Obteniendo contexto de BD desde MCP Server...');
      
      try {
        const promptResponse = await mcpClient.getPrompt('sql_assistant', {
          task: 'analysis'
        });
        
        // ⚡ Cargar prompt desde BD según perfil del usuario
        const promptContent = await this.getPromptFromDB('analysis', null);
        
        systemPrompt = {
          role: 'system',
          content: promptContent
        };
        
        console.log('✅ Contexto de análisis cargado');
    } catch (error) {
        console.error('⚠️ No se pudo cargar contexto de BD:', error.message);
        systemPrompt = {
          role: 'system',
          content: 'Eres un asistente de base de datos SQL Server.'
        };
      }
    }

    const messages = systemPrompt 
      ? [systemPrompt, ...conversationHistory, { role: 'user', content: userMessage }]
      : [...conversationHistory, { role: 'user', content: userMessage }];

    console.log(`\n💬 Usuario: ${userMessage}`);

    // Primera llamada a OpenAI
    let response = await this.client.chat.completions.create({
      model: model,
      messages: messages,
      tools: this.getMCPTools(),
      tool_choice: 'auto',
      temperature: temperature
    });

    let assistantMessage = response.choices[0].message;
    
    // Loop para manejar tool calls
    let maxIterations = 5;
    let iteration = 0;

    while (assistantMessage.tool_calls && iteration < maxIterations) {
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
      response = await this.client.chat.completions.create({
        model: model,
        messages: messages,
        tools: this.getMCPTools(),
        tool_choice: 'auto',
        temperature: temperature
      });

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
