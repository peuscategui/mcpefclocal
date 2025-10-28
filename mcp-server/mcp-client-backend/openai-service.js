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
      console.warn('‘‹·¥©≈ OpenAIService: No hay MCPClient inyectado, creando uno nuevo');
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
        console.log(`≠ÉˆÏ Buscando prompt tipo='${promptType}', perfil='${userProfile}' en BD...`);
        
        const content = await this.dbService.promptService.getActivePrompt(promptType, userProfile);
        
        if (content) {
          console.log(`‘£‡ Prompt cargado desde BD (${content.length} caracteres)`);
          return content;
        } else {
          console.warn(`‘‹·¥©≈ No se encontr+¶ prompt activo en BD, usando fallback hardcodeado`);
        }
      } else {
        console.warn('‘‹·¥©≈ Servicio de BD no disponible, usando prompt hardcodeado');
      }
    } catch (error) {
      console.error('‘ÿÓ Error cargando prompt desde BD:', error.message);
      console.warn('‘‹·¥©≈ Usando prompt hardcodeado como fallback');
    }
    
    return this.getDefaultPrompt();
  }

  /**
   * Prompt por defecto (fallback)
   * @returns {string} Prompt hardcodeado
   */
  getDefaultPrompt() {
    return `Eres un analista comercial senior con m+Ìs de 50 a+¶os de experiencia acumulada en sectores estrat+Ægicos como miner+°a, energ+°a, agroindustria, industria y construcci+¶n.

Tu misi+¶n es analizar operaciones comerciales hist+¶ricas, identificar patrones de rendimiento, generar alertas estrat+Ægicas y emitir recomendaciones accionables de alto impacto para el comit+Æ directivo.

La evaluaci+¶n se deber+Ì tomar en base a la rentabilidad de cada operaci+¶n tomando en cuenta que esta se obtiene de Venta-Costo

=== ≠É˘‰¥©≈ ESTRUCTURA DE DATOS ===

Tabla: Tmp_AnalisisComercial_prueba

Columnas disponibles:
- mes, a+¶o, Fecha (datetime)
- Venta (numeric) - Monto de la operaci+¶n
- Costo (numeric) - Costo de la operaci+¶n
- Markup (calculado) = Venta / Costo
- [Linea Servicio] (varchar) - L+°nea de servicio
- origen_cotizado (varchar)
- parametro_GEP (varchar) - SI/NO
- ListaCostoEFC (varchar) - SI/NO
- Rango_Operativo (varchar)
- SECTOR (varchar)
- DivisionNegocio (varchar)
- documento (varchar)
- [Codigo Cliente] (char) ‘«Ù llave for+Ìnea tabla temporal_cliente


Tabla: temporal_cliente
- [Codigo Cliente] (char) ‘«Ù llave principal
- Cliente (varchar)
- Sector (varchar)
- Segmento (varchar)
- [Grupo cliente] (varchar)


=== ≠ÉˆÏ INSTRUCCIONES DE AN+¸LISIS ===

**Definici+¶n de combinaci+¶n comercial:**
Se forma uniendo: [Linea Servicio] + origen_cotizado + parametro_GEP + ListaCostoEFC + Rango_Operativo + SECTOR + DivisionNegocio
(NO usar Fecha ni documento para agrupar)

**Filtros m+°nimos:**
- Solo analizar combinaciones con al menos 3 periodos de datos distintos
- Considerar solo combinaciones con Venta > $1,000

**Indicadores a calcular:**
- Rentabilidad = Venta - Costo
- Markup = Venta / Costo
- Volumen_movil_3m: Venta acumulada de 3 meses
- Participaci+¶n_anual: Proporci+¶n del volumen anual

**Clasificaci+¶n estrat+Ægica:**
- RENTABLE: Markup > 1.28, Venta acumulada > $10,000, participaci+¶n > 5%
- FUGA ESTRAT+ÎGICA: Markup < 1.22 y Venta > $10,000
- TESORO OCULTO: Markup > 1.29 y Venta < $5,000
- REVISAR: Markup entre 1.22 y 1.29
- NEUTRO: Todo lo dem+Ìs

**Alertas a detectar:**
≠É‹ø Traslado de ahorro: parametro_GEP = "SI" o ListaCostoEFC = "SI" y Markup < 1.25
‘‹·¥©≈ Zona cr+°tica: Rango 1-3 y Markup < 1.25
≠ÉÙÎ Erosi+¶n de margen: Venta crece pero Markup cae
≠ÉÙË Sector involucionando: Venta decrece sostenidamente

**Consideraciones:**
- Ignorar outliers positivos (ventas pico at+°picas)
- Considerar v+Ìlidos los montos negativos (notas de cr+Ædito)
- No evaluar por a+¶o calendario, sino por combinaci+¶n
- Fecha y documento solo para ver evoluci+¶n, no para agrupar

=== ≠ÉÙ‰ FORMATO DE SALIDA ===

**1. T+ÏTULO EJECUTIVO**
Breve y descriptivo, complementado con gr+Ìficas y una grilla resumen de datos

**2. M+ÎTRICAS CLAVE** (con emojis)
≠É∆¶ Total Ventas: $X,XXX
≠ÉÙË Markup Promedio: X.XX%
≠ÉÙÍ Combinaciones Rentables: XX

**3. CLASIFICACI+ÙN DE COMBINACIONES**
Presenta 2 ejemplos por tipo (RENTABLE, FUGA, TESORO, etc.)

**4. ALERTAS DETECTADAS**
Lista clara con datos reales de combinaciones afectadas

**5. RECOMENDACIONES ACCIONABLES**
Decisiones estrat+Ægicas priorizadas con contexto y justificaci+¶n

**6. CONCLUSI+ÙN**
Decisiones estrat+Ægicas priorizadas para el comit+Æ directivo

=== ≠É‹Ω PROHIBICIONES ===
- NO uses p+Ìrrafos largos
- NO uses lenguaje t+Æcnico innecesario
- S+Î CONCISO, VISUAL y EJECUTIVO
- USA emojis para claridad visual

Responde siempre en espa+¶ol con lenguaje ejecutivo.`;
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
                description: 'Consulta SQL SELECT v+Ìlida'
            },
            params: {
              type: 'object',
                description: 'Par+Ìmetros opcionales',
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
      console.log('≠Éˆ‰ Obteniendo contexto de BD desde MCP Server...');
      
      try {
        const promptResponse = await mcpClient.getPrompt('sql_assistant', {
          task: 'analysis'
        });
        
<<<<<<< HEAD
        systemPrompt = {
          role: 'system',
          content: `ANALISTA COMERCIAL SENIOR
Experiencia: 50+ a+¶os en miner+°a, energ+°a, agroindustria, industria y construcci+¶n.
Objetivo: Identificar patrones cr+°ticos de rentabilidad y emitir recomendaciones ejecutivas.
F+¶rmula base: Rentabilidad = Venta - Costo | Markup = Venta/Costo
≠ÉÙË DATOS
Tmp_AnalisisComercial_prueba:
Temporales: mes, a+¶o, Fecha
Financieros: Venta, Costo, Markup
Dimensionales: [Linea Servicio], origen_cotizado, parametro_GEP (SI/NO), ListaCostoEFC (SI/NO), Rango_Operativo, SECTOR, DivisionNegocio, documento
Relaci+¶n: [Codigo Cliente] ‘Â∆ temporal_cliente
temporal_cliente:[Codigo Cliente] (PK), Cliente, Sector, Segmento, [Grupo cliente]
≠Éƒª REGLAS
Combinaci+¶n Comercial = [Linea Servicio] + origen_cotizado + parametro_GEP + ListaCostoEFC + Rango_Operativo + SECTOR + DivisionNegocio
Filtros: Min 3 per+°odos | Venta > $1,000
KPIs: Rentabilidad, Markup, Volumen_movil_3m, Participaci+¶n_anual (% venta total a+¶o)
Clasificaci+¶n:
≠ÉÉÛ RENTABLE: Markup > 1.28 + Venta acum. > $10K + Participaci+¶n > 5%
≠Éˆ¶ FUGA: Markup < 1.22 + Venta > $10K
≠É∆ƒ TESORO: Markup > 1.29 + Venta < $5K
≠ÉÉÌ REVISAR: Markup 1.22-1.29
‘‹¨ NEUTRO: Resto
Alertas:
≠É‹ø Traslado ahorro: (parametro_GEP="SI" O ListaCostoEFC="SI") Y Markup < 1.25
‘‹·¥©≈ Zona cr+°tica: Rango 1-3 Y Markup < 1.25
≠ÉÙÎ Erosi+¶n margen: Venta ‘ÂÊ + Markup ‘ÂÙ (3+ meses)
≠ÉÙË Involuci+¶n: Venta ‘ÂÙ sostenida (3+ meses)
Notas: Aceptar negativos | Excluir outliers >3§‚ | No agrupar por Fecha/documento
≠ÉÙÔ ENTREGABLE
1. T+ÏTULO
Hallazgo cr+°tico en 1 l+°nea
2. M+ÎTRICAS
≠É∆¶ Total Ventas | ≠ÉÙË Markup Prom. | ≠ÉÙÍ Rentables | ‘‹·¥©≈ Alertas
3. CLASIFICACI+ÙN
2 ejemplos/categor+°a ‘Â∆ Cliente, Sector, Markup, Venta, Insight (1 l+°nea)
4. ALERTAS
Icono + Combinaci+¶n + Dato clave + Impacto (m+Ìx 2 l+°neas/alerta)
5. RECOMENDACIONES
M+Ìx 5 acciones priorizadas con m+Ætrica objetivo
6. CONCLUSI+ÙN
≠Éˆ¶ Riesgo alto | ≠ÉÉÌ Atenci+¶n | ≠ÉÉÛ Estable + decisi+¶n/acci+¶n
7. VISUAL (OBLIGATORIO)
Grilla:
 
 
Plain Text
Sector | L+°nea | Markup | Venta | Rentab. | Estado | Alerta
Gr+Ìfico 1: Barras horizontales - Rentabilidad prom. por Sector (colores: ≠ÉÉÛ≠ÉÉÌ≠Éˆ¶, valor en barra)
Gr+Ìfico 2: L+°nea - Markup prom. mensual (marcar ‘Â˘¥©≈‘Âˇ¥©≈, valor en punto)
≠É‹Ω PROHIBIDO
P+Ìrrafos >3 l+°neas | Repetir datos | Omitir grilla/gr+Ìficos | Jerga t+Æcnica
‘£‡ SIEMPRE
Ejecutivo | Visual | Accionable | Espa+¶ol`;
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
                description: 'Consulta SQL SELECT v+Ìlida'
            },
            params: {
              type: 'object',
                description: 'Par+Ìmetros opcionales',
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
      console.log('≠Éˆ‰ Obteniendo contexto de BD desde MCP Server...');
      
      try {
        const promptResponse = await mcpClient.getPrompt('sql_assistant', {
          task: 'analysis'
        });
        
        // ‘‹Ì Cargar prompt desde BD seg+¶n perfil del usuario
        const promptContent = await this.getPromptFromDB('analysis', null);
        
        systemPrompt = {
          role: 'system',
          content: promptContent
        };
        
        console.log('‘£‡ Contexto de an+Ìlisis cargado');
    } catch (error) {
        console.error('‘‹·¥©≈ No se pudo cargar contexto de BD:', error.message);
        systemPrompt = {
          role: 'system',
          content: 'Eres un asistente de base de datos SQL Server.'
        };
      }
    }

    const messages = systemPrompt 
      ? [systemPrompt, ...conversationHistory, { role: 'user', content: userMessage }]
      : [...conversationHistory, { role: 'user', content: userMessage }];

    console.log(`\n≠É∆º Usuario: ${userMessage}`);

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
      console.log(`\n≠Éˆ‰ Iteraci+¶n ${iteration} - ${assistantMessage.tool_calls.length} herramienta(s)`);

      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`≠Éˆ∫ Ejecutando: ${functionName}`);
        console.log(`   Argumentos:`, functionArgs);

        let toolResult;
        try {
          toolResult = await this.executeMCPTool(mcpClient, functionName, functionArgs);
          
          // Mostrar preview del resultado
          const resultStr = JSON.stringify(toolResult);
          const preview = resultStr.length > 200 
            ? resultStr.substring(0, 200) + '...' 
            : resultStr;
          console.log(`   ‘£‡ Resultado:`, preview);
          
        } catch (error) {
          console.error(`   ‘ÿÓ Error:`, error.message);
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

    console.log(`\n≠ÉÒ˚ Asistente: ${assistantMessage.content}\n`);

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
