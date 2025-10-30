// Rutas de chat y procesamiento de consultas
import express from 'express';
import MCPClient from '../mcp-client.js';
import OpenAIService from '../openai-service.js';
import DatabaseService from '../db-service.js';  // ← HABILITADO para historial
import { requireAuth, validateInput } from '../middleware/auth-middleware.js';
import Joi from 'joi';
import { 
  getCachedQuery, 
  setCachedQuery, 
  detectUserIntent,
  getQueryFromTemplate,
  getCacheStats,
  QUERY_TEMPLATES
} from '../utils/query-cache.js';

// Mapeo de frases comunes a intenciones para fallback directo
const INTENCIONES_COMUNES = {
  'ventas del último mes': 'ventas_ultimo_mes',
  'dame las ventas del último mes': 'ventas_ultimo_mes',
  'cuánto vendimos el último mes': 'ventas_ultimo_mes',
  'ventas del mes pasado': 'ventas_ultimo_mes',
  'último mes': 'ventas_ultimo_mes',
  'ventas este mes': 'ventas_este_mes',
  'ventas del mes actual': 'ventas_este_mes',
  'comparativo 2024 vs 2025': 'comparativo_2024_2025',
  'comparar 2024 y 2025': 'comparativo_2024_2025',
  'ventas 2024 vs 2025': 'comparativo_2024_2025',
  'ventas del 2024': 'ventas_2024',
  'ventas del 2025': 'ventas_2025',
  'ventas 2024': 'ventas_2024',
  'ventas 2025': 'ventas_2025'
};

const router = express.Router();

// ⚠️ Nota: Estos servicios se inicializan cuando se importa el módulo
// Los valores de estas variables están disponibles desde server.js
const dbService = new DatabaseService();  // ← HABILITADO

// Funciones de inicialización (se llaman desde server.js)
let mcpClient = null;
let openaiService = null;

export function setMCPClient(client) {
  mcpClient = client;
  // Pasar el cliente compartido Y el servicio de BD para prompts
  openaiService = new OpenAIService(client, dbService);
}

// Inicializar servicios de base de datos (conexión retrasada hasta que se use)
export async function initializeServices() {
  // ⚠️ SOLO MODE: Intentar conectar a BD de usuarios/conversaciones
  try {
    await dbService.connect();
    console.log('✅ Servicio de historial habilitado');
    
    // Re-crear OpenAIService con el dbService ahora conectado
    if (mcpClient) {
      openaiService = new OpenAIService(mcpClient, dbService);
      console.log('✅ OpenAIService actualizado con acceso a prompts de BD');
    }
  } catch (error) {
    console.warn('⚠️ Servicio de historial NO disponible (permisos insuficientes):', error.message);
    console.log('ℹ️ El sistema funcionará sin historial de conversaciones ni prompts de BD');
  }
}

// Esquemas de validación
const chatSchema = Joi.object({
  message: Joi.string().min(1).max(2000).required(),
  conversationId: Joi.number().integer().positive().optional(),
  userId: Joi.string().optional(),  // ← ID del usuario ('admin' o 'caceres')
  context: Joi.object().optional()
});

const conversationSchema = Joi.object({
  title: Joi.string().min(1).max(500).required()
});

/**
 * Extrae SQL de una respuesta de OpenAI que puede contener markdown
 */
function extractSQLFromResponse(content) {
  // Extraer SQL de bloques de código markdown
  const sqlMatch = content.match(/```sql\n([\s\S]+?)\n```/);
  if (sqlMatch) {
    console.log('✅ SQL extraído de bloque markdown');
    return sqlMatch[1].trim();
  }
  
  // Si no hay bloque de código, buscar SELECT directamente
  const selectMatch = content.match(/SELECT[\s\S]+?FROM[\s\S]+?(?:;|$)/i);
  if (selectMatch) {
    console.log('✅ SQL extraído de texto plano');
    return selectMatch[0].replace(/;$/, '').trim();
  }
  
  console.log('⚠️ No se pudo extraer SQL, usando contenido completo');
  return content.trim();
}

/**
 * Formatea la respuesta de ventas de manera ejecutiva
 */
function formatearRespuestaVentas(datos, contexto, esTemplate = false) {
  if (!datos || !datos.data || datos.data.length === 0) {
    return `⚠️ No se encontraron datos para ${contexto.nombre_mes_anterior} ${contexto.año_mes_anterior}`;
  }
  
  const primeraFila = datos.data[0];
  const totalVentas = primeraFila.Ventas || primeraFila.total_ventas || 0;
  const numTransacciones = primeraFila.Transacciones || primeraFila.num_transacciones || 0;
  const promedioVenta = primeraFila.PromedioVenta || primeraFila.promedio_venta || (totalVentas / numTransacciones);
  
  return `📊 VENTAS DE ${contexto.nombre_mes_anterior.toUpperCase()} ${contexto.año_mes_anterior}

💰 Total: S/ ${Number(totalVentas).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
   (basado en ${numTransacciones.toLocaleString('es-PE')} transacciones)

📈 Promedio por transacción: S/ ${Number(promedioVenta).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

🔍 Periodo analizado: 01/${String(contexto.mes_anterior).padStart(2, '0')}/${contexto.año_mes_anterior} - ${new Date(contexto.año_mes_anterior, contexto.mes_anterior, 0).getDate()}/${String(contexto.mes_anterior).padStart(2, '0')}/${contexto.año_mes_anterior}
${esTemplate ? '✅ Consulta optimizada con template predefinido' : '🤖 Consulta procesada con IA'}`;
}

/**
 * Detecta intención usando mapeo directo de frases comunes
 */
function detectarIntencionDirecta(mensaje) {
  const mensajeLower = mensaje.toLowerCase().trim();
  
  // Buscar coincidencia exacta o parcial
  for (const [frase, intencion] of Object.entries(INTENCIONES_COMUNES)) {
    if (mensajeLower.includes(frase)) {
      console.log(`🎯 Intención detectada directamente: "${frase}" → ${intencion}`);
      return intencion;
    }
  }
  
  console.log('❓ No se detectó intención directa, usando detección avanzada');
  return null;
}

// Función helper para normalizar y enriquecer consultas con contexto temporal
function normalizarConsulta(mensajeUsuario) {
  const ahora = new Date();
  const mesActual = ahora.getMonth() + 1;
  const añoActual = ahora.getFullYear();
  
  // Calcular mes anterior
  let mesAnterior = mesActual - 1;
  let añoMesAnterior = añoActual;
  if (mesAnterior === 0) {
    mesAnterior = 12;
    añoMesAnterior = añoActual - 1;
  }
  
  const contextoTemporal = {
    fecha_actual: ahora.toISOString().split('T')[0],
    año_actual: añoActual,
    mes_actual: mesActual,
    mes_anterior: mesAnterior,
    año_mes_anterior: añoMesAnterior,
    nombre_mes_actual: ahora.toLocaleString('es', { month: 'long' }),
    nombre_mes_anterior: new Date(añoMesAnterior, mesAnterior - 1).toLocaleString('es', { month: 'long' })
  };
  
  // Enriquecer el mensaje del usuario
  let mensajeEnriquecido = `[CONTEXTO TEMPORAL]
- Hoy es: ${contextoTemporal.fecha_actual}
- Mes actual: ${contextoTemporal.nombre_mes_actual} ${contextoTemporal.año_actual}
- Mes anterior (último mes): ${contextoTemporal.nombre_mes_anterior} ${contextoTemporal.año_mes_anterior}

[CONSULTA DEL USUARIO]
${mensajeUsuario}

[INSTRUCCIÓN]
Si el usuario menciona "último mes", debe referirse a ${contextoTemporal.nombre_mes_anterior} ${contextoTemporal.año_mes_anterior} completo.`;
  
  return { mensajeEnriquecido, contextoTemporal };
}

// Función helper para formatear moneda
function formatearMoneda(valor) {
  return Number(valor).toLocaleString('es-PE', { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2 
  });
}

// Función para analizar y formatear resultados sin OpenAI (más confiable)
function analizarYFormatearResultados(datos, contextoTemporal, tipoConsulta) {
  if (!datos || datos.length === 0) {
    return `⚠️ No se encontraron datos para ${contextoTemporal.nombre_mes_anterior} ${contextoTemporal.año_mes_anterior}`;
  }
  
  // VALIDACIÓN: Detectar si hay un solo periodo
  const periodoUnico = datos.length === 1;
  
  if (periodoUnico && tipoConsulta === 'ventas_ultimo_mes') {
    const registro = datos[0];
    const totalVentas = registro.Ventas || registro.total_ventas || 0;
    const numTransacciones = registro.Transacciones || registro.num_transacciones || 0;
    const promedioVenta = registro.PromedioVenta || registro.promedio_venta || (totalVentas / numTransacciones);
    const mes = registro.Mes || contextoTemporal.nombre_mes_anterior;
    const año = registro.Año || contextoTemporal.año_mes_anterior;
    
    return `📊 ANÁLISIS DE ${mes.toUpperCase()} ${año}

💰 **Total Ventas**: S/ ${formatearMoneda(totalVentas)}
📊 **Transacciones**: ${numTransacciones.toLocaleString('es-PE')}
📈 **Promedio**: S/ ${formatearMoneda(promedioVenta)} por transacción

ℹ️ **NOTA**: Solo hay datos disponibles para ${mes} ${año} en el sistema.
Para identificar tendencias (mejor/peor mes), se necesitan datos de múltiples periodos.

✅ *Análisis generado con template predefinido*`;
  }
  
  // Si hay múltiples periodos, devolver null para usar OpenAI
  return null;
}

// Función para formatear análisis comparativo (múltiples meses)
function formatearAnalisisComparativo(datos, contextoTemporal) {
  // Validación 1: Datos vacíos
  if (!datos || !datos.data || datos.data.length === 0) {
    return `⚠️ No se encontraron datos para el análisis comparativo.`;
  }
  
  const registros = datos.data;
  
  // Validación 2: Solo un mes (no se puede comparar)
  if (registros.length === 1) {
    const mes = registros[0].Mes || registros[0].NombreMes;
    const año = registros[0].Año;
    return `⚠️ **DATOS INSUFICIENTES PARA COMPARACIÓN**

Solo hay datos disponibles para **${mes} ${año}**.

Para realizar un análisis comparativo, se necesitan datos de al menos 2 meses.

📊 **DATOS ACTUALES:**
- ${mes} ${año}: S/ ${formatearMoneda(registros[0].Ventas)} (${registros[0].Transacciones?.toLocaleString('es-PE') || 'N/A'} transacciones)

💡 **RECOMENDACIÓN:** 
Solicita "ventas del último mes" para ver el análisis detallado de ${mes}.`;
  }
  
  // Calcular métricas
  const totalVentas = registros.reduce((sum, r) => sum + (r.Ventas || 0), 0);
  const promedioMensual = totalVentas / registros.length;
  
  // Ordenar por ventas para encontrar mejor y peor
  const ordenados = [...registros].sort((a, b) => (b.Ventas || 0) - (a.Ventas || 0));
  const mejorMes = ordenados[0];
  const peorMes = ordenados[ordenados.length - 1];
  
  // Calcular diferencia porcentual entre mejor y peor
  const diferenciaPorcentual = peorMes.Ventas > 0
    ? ((mejorMes.Ventas / peorMes.Ventas - 1) * 100).toFixed(1)
    : 0;
  
  // Calcular crecimiento temporal (primer vs último mes cronológicamente)
  const primerMes = registros[registros.length - 1]; // Más antiguo
  const ultimoMes = registros[0]; // Más reciente
  const crecimientoTemporal = primerMes.Ventas > 0 
    ? ((ultimoMes.Ventas - primerMes.Ventas) / primerMes.Ventas * 100).toFixed(1)
    : 0;
  
  let respuesta = `📊 ANÁLISIS COMPARATIVO (${registros.length} meses)

💰 **Total Acumulado**: S/ ${formatearMoneda(totalVentas)}
📊 **Promedio Mensual**: S/ ${formatearMoneda(promedioMensual)}

🏆 **Mejor Mes**: ${mejorMes.Mes || mejorMes.NombreMes} ${mejorMes.Año}
   └─ S/ ${formatearMoneda(mejorMes.Ventas)} (${mejorMes.Transacciones?.toLocaleString('es-PE') || 'N/A'} transacciones)

📉 **Mes Más Bajo**: ${peorMes.Mes || peorMes.NombreMes} ${peorMes.Año}
   └─ S/ ${formatearMoneda(peorMes.Ventas)} (${peorMes.Transacciones?.toLocaleString('es-PE') || 'N/A'} transacciones)

📈 **Diferencia**: ${diferenciaPorcentual}% más alto

`;

  // Si hay tendencia temporal significativa, mencionarla
  if (Math.abs(parseFloat(crecimientoTemporal)) > 5) {
    const tendencia = parseFloat(crecimientoTemporal) > 0 ? '📈 Crecimiento' : '📉 Decrecimiento';
    respuesta += `${tendencia}: ${Math.abs(crecimientoTemporal)}% (${primerMes.Mes || primerMes.NombreMes} → ${ultimoMes.Mes || ultimoMes.NombreMes})\n\n`;
  }

  respuesta += `## 📅 Detalle por Mes\n\n`;

  registros.forEach(r => {
    const mes = r.Mes || r.NombreMes;
    const variacion = r.Ventas > promedioMensual 
      ? `+${((r.Ventas - promedioMensual) / promedioMensual * 100).toFixed(1)}%`
      : `${((r.Ventas - promedioMensual) / promedioMensual * 100).toFixed(1)}%`;
    
    const indicador = r.Ventas > promedioMensual ? '🟢' : '🔴';
    
    respuesta += `${indicador} **${mes} ${r.Año}**: S/ ${formatearMoneda(r.Ventas)} (${variacion} vs promedio)\n`;
  });
  
  respuesta += `\n✅ *Análisis Comparativo Automático*`;
  
  return respuesta;
}

// Función para construir metadata de visualización para el frontend
function construirMetadataVisualizacion(datos, tipoAnalisis, contextoTemporal, mensajeOriginal = '', sectorValidado = null) {
  // Determinar si es periodo único
  const registros = datos?.data || [];
  const periodoUnico = registros.length === 1;
  const esContextoClientes = registros.length > 0 &&
    registros[0] && registros[0].Cliente !== undefined &&
    registros[0].Mes === undefined && registros[0].Año === undefined;
  
  console.log('🔍 construirMetadataVisualizacion - Datos recibidos:', {
    cantidad_registros: registros.length,
    primer_registro: registros[0],
    tipo_analisis: tipoAnalisis
  });
  
  // Determinar la métrica principal (puede ser Ventas, Rentabilidad, etc.)
  let metricaPrincipal = 'Ventas';
  let nombreMetrica = 'Ventas';
  if (registros.length > 0) {
    const primeraFila = registros[0];
    if (primeraFila.Rentabilidad !== undefined) {
      metricaPrincipal = 'Rentabilidad';
      nombreMetrica = 'Rentabilidad';
    } else if (primeraFila.TotalVenta !== undefined) {
      metricaPrincipal = 'TotalVenta';
      nombreMetrica = 'Ventas';
    } else if (primeraFila.Ventas !== undefined) {
      metricaPrincipal = 'Ventas';
      nombreMetrica = 'Ventas';
    }
  }
  
  console.log(`📊 Métrica principal detectada: ${metricaPrincipal}`);
  
  // Calcular métricas básicas
  let totalVentas = 0;
  let totalTransacciones = 0;
  let mejorMes = null;
  let peorMes = null;
  let promedioMensual = 0;
  
  // Detectar si hay datos mensuales (tienen columna Mes o Año)
  const tieneDatosMensuales = registros.length > 0 && 
    (registros[0].Mes !== undefined || registros[0].Año !== undefined);
  
  // Contar meses únicos para calcular promedio mensual correcto
  let mesesUnicos = new Set();
  let añosUnicos = new Set();
  
  if (registros.length > 0) {
    // ✅ DEBUG: Ver primer registro para entender estructura
    console.log(`🔍 Primer registro (estructura):`, {
      keys: Object.keys(registros[0]),
      valores: registros[0],
      metrica_principal: metricaPrincipal,
      tiene_rentabilidad: registros[0].Rentabilidad !== undefined,
      tiene_totalventa: registros[0].TotalVenta !== undefined,
      tiene_ventas: registros[0].Ventas !== undefined
    });
    
    // Calcular total - intentar múltiples campos y manejar strings numéricos
    totalVentas = registros.reduce((sum, r) => {
      // Intentar múltiples campos posibles
      let valor = null;
      
      // 1. Intentar con la métrica principal detectada
      if (r[metricaPrincipal] !== undefined && r[metricaPrincipal] !== null) {
        valor = parseFloat(r[metricaPrincipal]);
        if (!isNaN(valor)) {
          return sum + valor;
        }
      }
      
      // 2. Intentar con Rentabilidad (para consultas de clientes)
      if (r.Rentabilidad !== undefined && r.Rentabilidad !== null) {
        valor = parseFloat(r.Rentabilidad);
        if (!isNaN(valor)) {
          return sum + valor;
        }
      }
      
      // 3. Intentar con TotalVenta
      if (r.TotalVenta !== undefined && r.TotalVenta !== null) {
        valor = parseFloat(r.TotalVenta);
        if (!isNaN(valor)) {
          return sum + valor;
        }
      }
      
      // 4. Intentar con Ventas
      if (r.Ventas !== undefined && r.Ventas !== null) {
        valor = parseFloat(r.Ventas);
        if (!isNaN(valor)) {
          return sum + valor;
        }
      }
      
      // Si no se encontró ningún valor válido, devolver la suma sin cambios
      return sum;
    }, 0);
    
    totalTransacciones = registros.reduce((sum, r) => sum + (parseInt(r.Transacciones) || parseInt(r.NumOperaciones) || 1), 0);
    
    // Contar meses/años únicos
    registros.forEach(r => {
      if (r.Mes) mesesUnicos.add(r.Mes);
      if (r.Año) añosUnicos.add(r.Año);
    });
    
    // Calcular promedio mensual SOLO si hay datos mensuales reales
    if (tieneDatosMensuales && mesesUnicos.size > 0) {
      promedioMensual = totalVentas / mesesUnicos.size;
    } else if (registros.length > 0) {
      // Si no hay meses, usar número de registros (puede ser clientes u otros)
      promedioMensual = totalVentas / registros.length;
    }
    
    console.log(`✅ Métricas calculadas - Total: ${totalVentas.toFixed(2)}, Promedio: ${promedioMensual.toFixed(2)}, Registros: ${registros.length}, Meses únicos: ${mesesUnicos.size}, Métrica principal: ${metricaPrincipal}`);
    
    if (!periodoUnico) {
      const ordenados = [...registros].sort((a, b) => 
        (b[metricaPrincipal] || b.Ventas || 0) - (a[metricaPrincipal] || a.Ventas || 0)
      );
      mejorMes = ordenados[0];
      peorMes = ordenados[ordenados.length - 1];
    }
  }
  
  // ✅ NUEVO: Detectar periodo dinámicamente para títulos claros
  let periodoTexto = '';
  let añosInvolucrados = [];
  let mesesInvolucrados = [];
  
  // Primero intentar extraer de los datos
  if (registros.length > 0) {
    añosInvolucrados = [...new Set(registros.map(r => r.Año).filter(Boolean))].sort();
    mesesInvolucrados = registros.map(r => r.Mes).filter(Boolean);
    
    if (añosInvolucrados.length === 2) {
      // Comparación de años
      periodoTexto = `${añosInvolucrados[0]} vs ${añosInvolucrados[1]}`;
    } else if (añosInvolucrados.length === 1) {
      // Un solo año
      if (mesesInvolucrados.length > 0) {
        // Hay meses en los datos, mostrar rango o mes específico
        const primerMes = mesesInvolucrados[0];
        const ultimoMes = mesesInvolucrados[mesesInvolucrados.length - 1];
        periodoTexto = primerMes === ultimoMes ? `${primerMes} ${añosInvolucrados[0]}` : `${añosInvolucrados[0]}`;
      } else {
        // Solo año sin meses específicos
        periodoTexto = `${añosInvolucrados[0]}`;
      }
    } else if (mesesInvolucrados.length > 0) {
      // Solo meses sin años en datos
      const primerMes = mesesInvolucrados[0];
      const ultimoMes = mesesInvolucrados[mesesInvolucrados.length - 1];
      periodoTexto = primerMes === ultimoMes ? primerMes : `${primerMes} - ${ultimoMes}`;
    }
  }
  
  // ✅ Si no se pudo detectar desde los datos (consultas de clientes sin columnas temporales),
  // intentar extraer del mensaje original
  if (!periodoTexto && mensajeOriginal) {
    const mensajeLower = mensajeOriginal.toLowerCase();
    
    // Buscar año específico (2024, 2025)
    const añoMatch = mensajeOriginal.match(/\b(202[4-9]|202\d)\b/);
    if (añoMatch) {
      const añoEncontrado = añoMatch[1];
      periodoTexto = añoEncontrado;
      
      // Verificar si también menciona un mes específico
      const mesesNombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                            'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
      const mesMencionado = mesesNombres.find(mes => mensajeLower.includes(mes));
      
      if (!mesMencionado) {
        // Año completo sin mes específico - mostrar solo el año
        periodoTexto = añoEncontrado;
      } else {
        // Hay mes específico - mostrar mes y año
        periodoTexto = `${mesMencionado.charAt(0).toUpperCase() + mesMencionado.slice(1)} ${añoEncontrado}`;
      }
    } else {
      // No hay año en el mensaje, usar fallback del contexto temporal
      periodoTexto = `${contextoTemporal.nombre_mes_anterior} ${contextoTemporal.año_mes_anterior}`;
    }
  } else if (!periodoTexto) {
    // Último fallback
    periodoTexto = `${contextoTemporal.nombre_mes_anterior} ${contextoTemporal.año_mes_anterior}`;
  }
  
  // ✅ Usar sector validado completo (si está disponible) o detectar desde mensaje
  let sectorTexto = '';
  if (sectorValidado && sectorValidado.sector) {
    // Usar el sector completo validado (ej: "2. Minería 2")
    sectorTexto = sectorValidado.sector;
    console.log(`✅ Usando sector validado completo en títulos: "${sectorTexto}"`);
  } else if (mensajeOriginal) {
    // Fallback: detectar desde mensaje (puede no ser exacto)
    const mensajeLower = mensajeOriginal.toLowerCase();
    const sectorMatch = mensajeOriginal.match(/sector\s+(\d+\.?\s*)?(.+?)(?:\s+\d+|$)/i) ||
                        mensajeOriginal.match(/\b(minería|energía|construcción|retail|servicios)\b/i);
    if (sectorMatch) {
      const sectorEncontrado = sectorMatch[1] ? `${sectorMatch[1].trim()}. ${sectorMatch[2].trim()}` : sectorMatch[2].trim();
      sectorTexto = sectorEncontrado.charAt(0).toUpperCase() + sectorEncontrado.slice(1);
      console.log(`⚠️ Usando sector detectado desde mensaje (puede no ser exacto): "${sectorTexto}"`);
    }
  }
  
  // Construir sufijo de periodo con sector si aplica (formato compacto)
  const sufijoPeriodo = sectorTexto ? `${periodoTexto} - ${sectorTexto}` : periodoTexto;
  
  // ✅ NUEVO: Generar títulos ejecutivos para cada visualización
  const titulos = {
    resumen: `${nombreMetrica} - ${sufijoPeriodo}`,
    mejor_peor: esContextoClientes ? `🏆 Mejores y Peores Clientes - ${sufijoPeriodo}` : `🏆 Mejores y Peores Periodos - ${sufijoPeriodo}`,
    comparativa: `📈 Comparativa de ${nombreMetrica} - ${sufijoPeriodo}`,
    evolucion: `📉 Evolución de ${nombreMetrica} - ${sufijoPeriodo}`,
    detalle: `📋 Análisis Detallado - ${sufijoPeriodo}`
  };
  
  return {
    tipo_analisis: tipoAnalisis,
    periodo_unico: periodoUnico,
    periodo_analizado: periodoTexto,
    periodo_analizado_completo: `${contextoTemporal.nombre_mes_anterior} ${contextoTemporal.año_mes_anterior}`,
    cantidad_periodos: registros.length,
    metrica_principal: metricaPrincipal,
    nombre_metrica: nombreMetrica,
    contexto: esContextoClientes ? 'clientes' : 'periodos',
    años_comparados: añosInvolucrados,
    
    // ✅ NUEVO: Títulos ejecutivos para cada componente
    titulos: titulos,
    
    // Flags para el frontend sobre qué visualizaciones mostrar
    visualizaciones_recomendadas: {
      mostrar_mejor_peor_mes: !periodoUnico && registros.length >= 2,
      mostrar_comparativa: !periodoUnico && registros.length >= 2,
      mostrar_metricas_basicas: true,
      mostrar_evolucion_diaria: tipoAnalisis === 'ventas_ultimo_mes' && periodoUnico,
      mostrar_tendencia_temporal: !periodoUnico && registros.length >= 3,
      mostrar_grafico_barras: !periodoUnico,
      mostrar_grafico_linea: !periodoUnico && registros.length >= 3,
      mostrar_tabla_detalle: registros.length > 0,
      ocultar_tabla_por_defecto: registros.length > 10  // ✅ NUEVO: Ocultar si > 10 filas
    }
  };
  
  // ✅ Construir datos_para_graficos con los valores calculados (antes del return final)
  const datos_para_graficos = periodoUnico ? {
      // Datos para periodo único
    total_ventas: registros[0]?.[metricaPrincipal] || registros[0]?.Ventas || 0,
    transacciones: registros[0]?.Transacciones || 1,
    promedio: registros[0]?.PromedioVenta || registros[0]?.[metricaPrincipal] || 0,
      mes: registros[0]?.Mes || contextoTemporal.nombre_mes_anterior,
      año: registros[0]?.Año || contextoTemporal.año_mes_anterior,
    periodo: `${registros[0]?.Mes || contextoTemporal.nombre_mes_anterior} ${registros[0]?.Año || contextoTemporal.año_mes_anterior}`,
    // ✅ SIEMPRE incluir total_acumulado y promedio_mensual (usando valores calculados)
    total_acumulado: (totalVentas !== null && totalVentas !== undefined && !isNaN(totalVentas)) 
      ? totalVentas 
      : (parseFloat(registros[0]?.[metricaPrincipal]) || parseFloat(registros[0]?.Ventas) || 0),
    promedio_mensual: (promedioMensual !== null && promedioMensual !== undefined && !isNaN(promedioMensual)) 
      ? promedioMensual 
      : (parseFloat(registros[0]?.PromedioVenta) || parseFloat(registros[0]?.[metricaPrincipal]) || 0)
  } : {
    // Datos para múltiples periodos (ORDENADOS por monto de MAYOR a MENOR)
      meses: registros.map(d => ({
      mes: d.Mes || d.NombreMes || d.Cliente,
        año: d.Año,
      total: d[metricaPrincipal] || d.Ventas || 0,
      transacciones: d.Transacciones || 1,
      promedio: d.PromedioVenta || d[metricaPrincipal] || 0
    })).sort((a, b) => b.total - a.total),  // ✅ Ordenar de mayor a menor
      mejor_mes: mejorMes ? {
      mes: mejorMes.Mes || mejorMes.NombreMes || mejorMes.Cliente || '—',
      nombre_mes_completo: mejorMes.Mes || mejorMes.NombreMes || '—',
      año: mejorMes.Año || null,
      total: mejorMes[metricaPrincipal] || mejorMes.Ventas || 0,
      transacciones: mejorMes.Transacciones || 1
      } : null,
      peor_mes: peorMes ? {
      mes: peorMes.Mes || peorMes.NombreMes || peorMes.Cliente || '—',
      nombre_mes_completo: peorMes.Mes || peorMes.NombreMes || '—',
      año: peorMes.Año || null,
      total: peorMes[metricaPrincipal] || peorMes.Ventas || 0,
      transacciones: peorMes.Transacciones || 1
      } : null,
    total_acumulado: (totalVentas !== null && totalVentas !== undefined && !isNaN(totalVentas)) ? totalVentas : 0,
    total_transacciones: totalTransacciones || 0,
    promedio_mensual: (promedioMensual !== null && promedioMensual !== undefined && !isNaN(promedioMensual)) ? promedioMensual : 0,
    tiene_datos_mensuales: tieneDatosMensuales,
    cantidad_meses_unicos: mesesUnicos.size
  };
  
  // ✅ Log final para debugging
  console.log('📊 Valores finales incluidos en metadata:', {
    total_acumulado: datos_para_graficos.total_acumulado,
    promedio_mensual: datos_para_graficos.promedio_mensual,
    periodo_unico: periodoUnico,
    metrica_principal: metricaPrincipal,
    cantidad_registros: registros.length,
    tiene_meses: !!datos_para_graficos.meses,
    cantidad_meses: datos_para_graficos.meses?.length,
    primer_mes: datos_para_graficos.meses?.[0],
    es_contexto_clientes: esContextoClientes
  });
  
  return {
    tipo_analisis: tipoAnalisis,
    periodo_unico: periodoUnico,
    periodo_analizado: periodoTexto,
    periodo_analizado_completo: `${contextoTemporal.nombre_mes_anterior} ${contextoTemporal.año_mes_anterior}`,
    cantidad_periodos: registros.length,
    metrica_principal: metricaPrincipal,
    nombre_metrica: nombreMetrica,
    contexto: esContextoClientes ? 'clientes' : 'periodos',
    años_comparados: añosInvolucrados,
    
    // ✅ NUEVO: Títulos ejecutivos para cada componente
    titulos: titulos,
    
    // Flags para el frontend sobre qué visualizaciones mostrar
    visualizaciones_recomendadas: {
      mostrar_mejor_peor_mes: !periodoUnico && registros.length >= 2,
      mostrar_comparativa: !periodoUnico && registros.length >= 2,
      mostrar_metricas_basicas: true,
      mostrar_evolucion_diaria: tipoAnalisis === 'ventas_ultimo_mes' && periodoUnico,
      mostrar_tendencia_temporal: !periodoUnico && registros.length >= 3,
      mostrar_grafico_barras: !periodoUnico,
      mostrar_grafico_linea: !periodoUnico && registros.length >= 3,
      mostrar_tabla_detalle: registros.length > 0,
      ocultar_tabla_por_defecto: registros.length > 10  // ✅ NUEVO: Ocultar si > 10 filas
    },
    
    // Datos pre-calculados para gráficos
    datos_para_graficos: datos_para_graficos
  };
}

// Función para detectar el tipo de análisis requerido
function detectarTipoAnalisis(mensajeUsuario) {
  const mensajeLower = mensajeUsuario.toLowerCase();
  const tienePatronVsAnios = /\b20\d{2}\s*vs\s*20\d{2}\b/i.test(mensajeUsuario);
  
  // Palabras que indican análisis comparativo (múltiples periodos)
  const palabrasComparativas = [
    'mejor', 'peor', 'comparar', 'comparación', 'comparativo',
    'tendencia', 'evolución', 'crecimiento', 'variación',
    'últimos meses', 'ultimos meses', 'últimos 3 meses',
    'trimestre', 'semestre', 'histórico', 'historia'
  ];
  
  const esComparativo = tienePatronVsAnios || palabrasComparativas.some(p => mensajeLower.includes(p));
  
  if (esComparativo) {
    console.log('📊 Tipo de análisis: COMPARATIVO (múltiples periodos)');
    return 'analisis_comparativo';
  }
  
  // Consultas simples de un solo mes
  if (mensajeLower.includes('último mes') || 
      mensajeLower.includes('ultimo mes') ||
      mensajeLower.includes('mes pasado') ||
      mensajeLower.includes('mes anterior')) {
    console.log('📊 Tipo de análisis: SIMPLE (un solo mes)');
    return 'ventas_ultimo_mes';
  }
  
  // Consultas de un año específico
  if ((mensajeLower.includes('2024') || mensajeLower.includes('2025')) && 
      !tienePatronVsAnios && 
      !mensajeLower.includes('vs') && 
      !mensajeLower.includes('comparar')) {
    console.log('📊 Tipo de análisis: AÑO ESPECÍFICO');
    return 'ventas_año_especifico';
  }
  
  console.log('📊 Tipo de análisis: ABIERTA (OpenAI decide)');
  return 'consulta_abierta';
}

// Función para detectar consultas que requieren datos de la base de datos
function requiereDatosDeBD(message) {
  const msg = message.toLowerCase();
  
  // ❌ EXCLUSIONES: Consultas que NO requieren datos de BD (son conceptuales)
  const exclusiones = [
    'sectores destacados', 'qué sectores', 'cuáles sectores',
    'qué es', 'cómo funciona', 'explica', 'define',
    'diferencia entre', 'ventajas de', 'desventajas de',
    'cómo se calcula', 'qué significa', 'para qué sirve'
  ];
  
  // Si la consulta contiene alguna exclusión, NO requiere BD
  if (exclusiones.some(exclusion => msg.includes(exclusion))) {
    console.log('🚫 Consulta conceptual detectada, NO requiere BD');
    return false;
  }
  
  // ✅ INCLUSIONES: Palabras clave que SÍ requieren datos cuantitativos
  const palabrasCuantitativas = [
    'ventas',  // ✅ AGREGADO: Detectar "ventas" genérico
    'tendencia', 'último mes', 'cada mes', 'por mes', 'mensual',
    'comparar', 'comparativo', 'vs', 'entre',
    'análisis', 'datos', 'información',
    'total', 'suma', 'promedio',
    'estadísticas', 'métricas', 'reporte',
    'cuánto', 'cuántos', 'cuántas',
    'dame', 'muestra', 'obtener',
    // ✅ AGREGADO: Palabras para análisis de clientes y rentabilidad
    'detalle', 'detalles', 'listado', 'lista',
    'clientes', 'cliente',
    'rentabilidad', 'rentable', 'rentables',
    'menor', 'mayor', 'mejores', 'peores',
    'sector', 'sectores',
    'top', 'ranking'
  ];
  
  const requiereDatos = palabrasCuantitativas.some(palabra => msg.includes(palabra));
  
  console.log('🔍 requiereDatosDeBD:', {
    mensaje: message,
    requiereDatos,
    razon: requiereDatos ? 'Contiene palabras cuantitativas' : 'No contiene palabras cuantitativas'
  });
  
  return requiereDatos;
}

// ✅ Función para generar mensajes de aclaración dinámicos usando OpenAI (CAPA 3)
async function generarMensajeAclaracion(contexto, sectoresCandidatos, dbService, openaiService) {
  try {
    console.log('🤖 Generando mensaje de aclaración con OpenAI...');
    
    // Obtener reglas de negocio desde BD (CAPA 3)
    let reglasNegocio = '';
    if (dbService && dbService.promptService) {
      try {
        reglasNegocio = await dbService.promptService.getActivePrompt('analysis', null) || '';
        console.log('✅ Reglas de negocio obtenidas desde BD (CAPA 3)');
      } catch (error) {
        console.warn('⚠️ No se pudieron cargar reglas de negocio:', error.message);
      }
    }
    
    // Construir contexto para OpenAI
    const sectoresLista = sectoresCandidatos && sectoresCandidatos.length > 0
      ? sectoresCandidatos.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : 'No se encontraron sectores disponibles';
    
    // Construir prompt contextual según el tipo de aclaración
    let promptAclaracion = '';
    
    if (contexto.tipo && (contexto.tipo.includes('sector') || contexto.tipo === 'sector_ambiguo')) {
      // Aclaración sobre sectores
      promptAclaracion = `Eres un asistente comercial que ayuda a analizar datos de ventas y rentabilidad por sectores.

${reglasNegocio ? `\nREGLAS DE COMUNICACIÓN (desde base de datos - CAPA 3):\n${reglasNegocio}\n` : ''}

SITUACIÓN ACTUAL:
Necesitas pedir aclaración al usuario sobre el sector. Contexto:

${JSON.stringify(contexto, null, 2)}

SECTORES DISPONIBLES EN LA BASE DE DATOS:
${sectoresLista}

${contexto.tipo === 'sector_detectado_sin_palabra' ? 
  `NOTA IMPORTANTE: Detecté el patrón "${contexto.patron_detectado}" en la consulta del usuario, pero no mencionó explícitamente la palabra "sector". El sector candidato es "${contexto.sector_candidato}". Debes confirmar si este es el sector correcto de manera amable.` : ''}

${contexto.tipo === 'sector_no_encontrado' ? 
  `NOTA IMPORTANTE: El usuario mencionó "${contexto.patron_detectado}" pero no coincide con ningún sector en la base de datos. Podría estar refiriéndose a otra cosa (año, código, etc.). Pide aclaración de manera amable y proporciona ejemplos claros.` : ''}

INSTRUCCIONES:
1. Sé claro, amable y profesional
2. Explica brevemente por qué necesitas aclaración sobre el sector
3. Lista los sectores disponibles de forma clara
4. Proporciona 2-3 ejemplos concretos de cómo el usuario puede reformular su consulta incluyendo el sector exacto
5. Mantén el mensaje conciso pero completo
6. Usa formato markdown para mejor legibilidad

Genera el mensaje de aclaración sobre el sector:`;
    } else {
      // Aclaración sobre periodos u otra información faltante
      promptAclaracion = `Eres un asistente comercial que ayuda a analizar datos de ventas y rentabilidad.

${reglasNegocio ? `\nREGLAS DE COMUNICACIÓN (desde base de datos - CAPA 3):\n${reglasNegocio}\n` : ''}

SITUACIÓN ACTUAL:
Necesitas pedir aclaración al usuario sobre información faltante. Contexto:

${JSON.stringify(contexto, null, 2)}

INSTRUCCIONES:
1. Sé claro, amable y profesional
2. Explica brevemente qué información falta
3. Proporciona 3-4 ejemplos concretos de cómo el usuario puede reformular su consulta
4. Mantén el mensaje conciso pero completo
5. Usa formato markdown para mejor legibilidad

Genera el mensaje de aclaración:`;
    }
    
    // Usar OpenAI para generar el mensaje
    const respuesta = await openaiService.chat(
      promptAclaracion,
      [],
      {
        temperature: 0.3,
        model: 'gpt-4-turbo-preview',
        toolsEnabled: false // No necesitamos herramientas para generar mensajes
      }
    );
    
    const mensajeGenerado = respuesta.choices?.[0]?.message?.content || respuesta.content || 'Por favor, especifica el sector de tu consulta.';
    console.log('✅ Mensaje de aclaración generado por OpenAI');
    
    return mensajeGenerado;
    
  } catch (error) {
    console.error('❌ Error generando mensaje de aclaración con OpenAI:', error.message);
    // Fallback: mensaje genérico
    const sectoresLista = sectoresCandidatos && sectoresCandidatos.length > 0
      ? sectoresCandidatos.map((s, i) => `${i + 1}. **${s}**`).join('\n')
      : 'No se encontraron sectores disponibles';
    
    return `🔍 **Sector no especificado claramente**

Por favor, especifica el sector exacto de tu consulta. Sectores disponibles:

${sectoresLista}

**Ejemplos válidos:**
• "Clientes con mayor rentabilidad sector 2. Minería 2 2025"
• "Ventas del sector 1. Minería 1 en 2025"
• "Rentabilidad sector 4. EFC Corporativo 2025"`;
  }
}

// Función para obtener sectores válidos desde la BD (con cache en memoria)
let sectoresValidosCache = null;
async function obtenerSectoresValidos(mcpClient) {
  if (sectoresValidosCache) {
    return sectoresValidosCache;
  }
  
  try {
    const sqlSectores = `SELECT DISTINCT SECTOR 
                         FROM Tmp_AnalisisComercial_prueba 
                         WHERE SECTOR IS NOT NULL AND SECTOR != ''
                         ORDER BY SECTOR`;
    
    const resultado = await mcpClient.callTool('execute_query', { query: sqlSectores });
    
    if (resultado && resultado.content && resultado.content[0]) {
      const data = JSON.parse(resultado.content[0].text);
      if (data && data.data && data.data.length > 0) {
        sectoresValidosCache = data.data.map(r => r.SECTOR).filter(Boolean);
        console.log(`✅ Sectores válidos obtenidos (${sectoresValidosCache.length}):`, sectoresValidosCache);
        return sectoresValidosCache;
      }
    }
  } catch (error) {
    console.warn('⚠️ No se pudieron obtener sectores válidos:', error.message);
  }
  
  // Fallback: sectores conocidos
  return ['1. Minería 1', '2. Minería 2'];
}

// Función para validar y detectar sector exacto
async function detectarSectorExacto(message, mcpClient) {
  const msg = message.toLowerCase();
  
  console.log(`🔍 detectarSectorExacto - Mensaje recibido: "${message}"`);
  
  // Obtener sectores válidos primero para poder comparar
  const sectoresValidos = await obtenerSectoresValidos(mcpClient);
  console.log(`📋 Sectores válidos encontrados: ${sectoresValidos.join(', ')}`);
  
  // ✅ PRIORIDAD 1: Detectar con palabra "sector" explícita (MÁS CONFIABLE)
  // Mejorado: busca "sector" seguido de "N. Nombre" o solo "Nombre"
  // Captura patrones como: "sector 4. EFC Corporativo 2025" o "sector 2. Minería 2"
  const sectorMatchCompleto = message.match(/sector\s+(\d+\.\s+[A-Za-zÁÉÍÓÚáéíóúñÑ\s]+?)(?:\s+\d{4}|$)/i) ||
                              message.match(/sector\s+(\d+\.\s*[A-Za-zÁÉÍÓÚáéíóúñÑ\s]+?)(?:\s+202[0-9]|$)/i) ||
                              message.match(/sector\s+([A-Za-zÁÉÍÓÚáéíóúñÑ0-9\.\s]+?)(?:\s+202[0-9]|\s+\d{4}|$)/i);
  
  // ✅ PRIORIDAD 2: Detectar patrones tipo "N. Nombre" SIN palabra "sector" (SOLO SI NO HAY "sector" explícito)
  const patronSectorSinPalabra = !msg.includes('sector') && message.match(/\b(\d+)\.\s*([^\d]+?)(?:\s+\d+|$|\s+2024|\s+2025|\s+2026)/i);
  
  console.log(`🔍 sectorMatchCompleto (con palabra "sector"):`, sectorMatchCompleto ? `"${sectorMatchCompleto[0] || sectorMatchCompleto[1]}"` : 'null');
  console.log(`🔍 patronSectorSinPalabra (sin palabra "sector"):`, patronSectorSinPalabra ? `"${patronSectorSinPalabra[0]}"` : 'null');
  
  // ✅ MEJORA 3: Detectar menciones genéricas de tipos de sectores conocidos
  const mencionaMinería = msg.includes('minería') || msg.includes('mineria');
  const mencionaConstruccion = msg.includes('construcción') || msg.includes('construccion');
  const mencionaEFC = msg.includes('efc corporativo') || msg.includes('efc');
  const mencionaPlatino = msg.includes('platino');
  
  console.log(`🔍 menciones genéricas: minería=${mencionaMinería}, construcción=${mencionaConstruccion}, efc=${mencionaEFC}, platino=${mencionaPlatino}`);
  
  // ✅ PRIORIDAD MÁXIMA: Si hay mención EXPLÍCITA de "sector" + patrón, validarlo directamente
  if (sectorMatchCompleto) {
    // Extraer el texto del sector del match
    let sectorTexto = sectorMatchCompleto[1] || (sectorMatchCompleto[0] ? sectorMatchCompleto[0].replace(/^sector\s+/i, '').trim() : '');
    
    if (!sectorTexto && sectorMatchCompleto[0]) {
      // Si sectorMatchCompleto[1] no existe, extraer del match completo
      sectorTexto = sectorMatchCompleto[0].replace(/^sector\s+/i, '').trim();
    }
    
    if (sectorTexto) {
      console.log(`✅ Mención explícita de sector detectada: "${sectorTexto}"`);
      
      // Limpiar el texto: remover años, espacios extra, etc.
      sectorTexto = sectorTexto.replace(/\s+(2024|2025|2026)\s*$/i, '').trim();
      
      // Buscar coincidencia EXACTA primero
      let sectorEncontrado = sectoresValidos.find(s => {
        const sLower = s.toLowerCase().trim();
        const textoLower = sectorTexto.toLowerCase().trim();
        
        // Coincidencia exacta (caso insensible)
        if (sLower === textoLower) return true;
        
        // Coincidencia si el texto mencionado está contenido en el sector válido
        // Ej: "4. EFC Corporativo" debe coincidir con "4. EFC Corporativo"
        if (sLower.includes(textoLower) || textoLower.includes(sLower)) {
          // Verificar que tenga el número
          const numeroEnTexto = textoLower.match(/(\d+)/);
          const numeroEnSector = sLower.match(/(\d+)/);
          if (numeroEnTexto && numeroEnSector && numeroEnTexto[1] === numeroEnSector[1]) {
            return true;
          }
        }
        
        return false;
      });
      
      if (sectorEncontrado) {
        console.log(`✅ Sector válido encontrado (coincidencia exacta): "${sectorEncontrado}" - USANDO DIRECTAMENTE SIN PREGUNTAR`);
    return {
          sector: sectorEncontrado,
          filtroSQL: `%${sectorEncontrado}%`,
          requiereAclaracion: false
        };
      }
      
      // Si no hay coincidencia exacta, buscar por número y nombre parcial
      console.log(`⚠️ Sector mencionado pero sin coincidencia exacta, buscando por número y nombre...`);
      const numeroMatch = sectorTexto.match(/(\d+)/);
      const nombreMatch = sectorTexto.replace(/\d+/g, '').trim().toLowerCase();
      
      if (numeroMatch && nombreMatch) {
        const coincidenciasParciales = sectoresValidos.filter(s => {
          const sLower = s.toLowerCase();
          // Debe contener el número Y parte del nombre
          return sLower.includes(numeroMatch[1]) && 
                 (nombreMatch.length >= 3 ? sLower.includes(nombreMatch.substring(0, 3)) : true);
        });
        
        if (coincidenciasParciales.length === 1) {
          console.log(`✅ Sector encontrado por coincidencia parcial única: "${coincidenciasParciales[0]}" - USANDO SIN PREGUNTAR`);
    return {
            sector: coincidenciasParciales[0],
            filtroSQL: `%${coincidenciasParciales[0]}%`,
            requiereAclaracion: false
          };
        } else if (coincidenciasParciales.length === 0) {
          console.log(`❌ No se encontró coincidencia para: "${sectorTexto}"`);
          // Continuar con el flujo normal (puede ser otra cosa)
        } else {
          console.log(`⚠️ Múltiples coincidencias parciales: ${coincidenciasParciales.join(', ')}`);
          return {
            sector: null,
            filtroSQL: null,
            requiereAclaracion: true,
            sectoresCandidatos: coincidenciasParciales,
            contextoAclaracion: {
              tipo: 'sector_ambiguo',
              patron_detectado: sectorTexto
            }
          };
        }
      }
    }
  }
  
  // ✅ Si encontramos un patrón tipo "N. Nombre" (sin palabra sector), validarlo contra BD
  if (!msg.includes('sector') && patronSectorSinPalabra) {
    const numeroMatch = patronSectorSinPalabra[1];
    const nombreMatch = patronSectorSinPalabra[2].trim();
    
    console.log(`⚠️ Patrón detectado sin palabra "sector": "${numeroMatch}. ${nombreMatch}"`);
    
    // Buscar coincidencias en sectores válidos
    const posiblesCoincidencias = sectoresValidos.filter(s => {
      const sLower = s.toLowerCase();
      return sLower.includes(numeroMatch) && 
             sLower.includes(nombreMatch.toLowerCase());
    });
    
    if (posiblesCoincidencias.length === 1) {
      // Coincidencia única: podría ser válido, pero preguntar para confirmar
      console.log(`⚠️ Sector potencial detectado: "${posiblesCoincidencias[0]}" - REQUIERE CONFIRMACIÓN`);
    return {
        sector: null,
        filtroSQL: null,
        requiereAclaracion: true,
        sectoresCandidatos: posiblesCoincidencias,
        contextoAclaracion: {
          tipo: 'sector_detectado_sin_palabra',
          patron_detectado: `${numeroMatch}. ${nombreMatch}`,
          sector_candidato: posiblesCoincidencias[0]
        }
      };
    } else if (posiblesCoincidencias.length > 1) {
      // Múltiples coincidencias: preguntar
      return {
        sector: null,
        filtroSQL: null,
        requiereAclaracion: true,
        sectoresCandidatos: posiblesCoincidencias,
        contextoAclaracion: {
          tipo: 'sector_ambiguo',
          patron_detectado: `${numeroMatch}. ${nombreMatch}`
        }
      };
    } else {
      // No hay coincidencias: podría ser otra cosa (año, código, etc.) - PEDIR ACLARACIÓN
      return {
        sector: null,
        filtroSQL: null,
        requiereAclaracion: true,
        sectoresCandidatos: sectoresValidos,
        contextoAclaracion: {
          tipo: 'sector_no_encontrado',
          patron_detectado: `${numeroMatch}. ${nombreMatch}`,
          mensaje_usuario: message
        }
      };
    }
  }
  
  if (!sectorMatchCompleto && !mencionaMinería && !mencionaConstruccion && !mencionaEFC && !mencionaPlatino) {
    // Si no hay mención de sector ni tipos conocidos, retornar null (puede ser consulta general)
    console.log(`✅ No hay mención de sector, continuando sin filtro`);
    return { sector: null, filtroSQL: null, requiereAclaracion: false };
  }
  
  // ✅ CASO ESPECIAL: Si menciona "sector Minería" o tipo genérico sin número, preguntar
  const mencionaSectorGenerico = sectorMatchCompleto && sectorMatchCompleto[0] && 
                                   !sectorMatchCompleto[1] && // No tiene número
                                   (sectorMatchCompleto[2].toLowerCase().includes('minería') || 
                                    sectorMatchCompleto[2].toLowerCase().includes('mineria'));
  
  console.log(`🔍 mencionaSectorGenerico: ${mencionaSectorGenerico}`);
  
  // ✅ Si menciona "sector Minería/Construcción/EFC" (sin número) o solo el tipo genérico, buscar todos los que coincidan
  let sectoresGenericos = [];
  if ((!sectorMatchCompleto && mencionaMinería) || mencionaSectorGenerico) {
    sectoresGenericos = sectoresValidos.filter(s => s.toLowerCase().includes('minería') || s.toLowerCase().includes('mineria'));
  } else if (mencionaConstruccion) {
    sectoresGenericos = sectoresValidos.filter(s => s.toLowerCase().includes('construcción') || s.toLowerCase().includes('construccion'));
  } else if (mencionaEFC) {
    sectoresGenericos = sectoresValidos.filter(s => s.toLowerCase().includes('efc'));
  } else if (mencionaPlatino) {
    sectoresGenericos = sectoresValidos.filter(s => s.toLowerCase().includes('platino'));
  }
  
  if (sectoresGenericos.length > 0) {
    console.log(`⚠️ Sector genérico detectado, buscando coincidencias...`);
    console.log(`📋 Sectores encontrados: ${sectoresGenericos.join(', ')}`);
    
    if (sectoresGenericos.length > 1) {
      // Hay múltiples sectores: requiere aclaración
      console.log(`❓ Múltiples sectores encontrados, requiere aclaración`);
    return {
        sector: null,
        filtroSQL: null,
        requiereAclaracion: true,
        sectoresCandidatos: sectoresGenericos,
        contextoAclaracion: {
          tipo: 'sector_generico_multiple',
          tipo_mencionado: mencionaMinería ? 'minería' : mencionaConstruccion ? 'construcción' : mencionaEFC ? 'efc' : 'platino'
        }
      };
    } else if (sectoresGenericos.length === 1) {
      // Un solo sector: SIEMPRE preguntar para confirmar (ser conservador)
      console.log(`⚠️ Un solo sector encontrado, pero PEDIR CONFIRMACIÓN por seguridad`);
      return {
        sector: null,
        filtroSQL: null,
        requiereAclaracion: true,
        sectoresCandidatos: sectoresGenericos,
        contextoAclaracion: {
          tipo: 'sector_unico_potencial',
          sector_candidato: sectoresGenericos[0]
        }
      };
    }
  }
  
  // Si llegamos aquí, tenemos sectorMatchCompleto (hay mención explícita de sector)
  const numeroSector = sectorMatchCompleto[1]?.trim().replace(/\.$/, '');
  const nombreSector = sectorMatchCompleto[2].trim();
  
  // Intentar construir el sector completo
  let sectorDetectado = null;
  if (numeroSector && nombreSector) {
    // Intentar formato "N. Nombre N" o "N. Nombre"
    const posiblesFormatos = [
      `${numeroSector}. ${nombreSector} ${numeroSector}`, // "2. Minería 2"
      `${numeroSector}. ${nombreSector}`,                 // "2. Minería"
      nombreSector                                         // Solo "Minería"
    ];
    
    // Buscar coincidencia exacta en sectores válidos
    for (const formato of posiblesFormatos) {
      const coincidenciaExacta = sectoresValidos.find(s => s.toLowerCase() === formato.toLowerCase());
      if (coincidenciaExacta) {
        sectorDetectado = coincidenciaExacta;
        break;
      }
    }
    
    // Si no hay coincidencia exacta, buscar coincidencia parcial
    if (!sectorDetectado) {
      const coincidenciasParciales = sectoresValidos.filter(s => 
        s.toLowerCase().includes(nombreSector.toLowerCase()) &&
        (numeroSector ? s.toLowerCase().includes(numeroSector) : true)
      );
      
      if (coincidenciasParciales.length === 1) {
        // Solo una coincidencia: usarla
        sectorDetectado = coincidenciasParciales[0];
      } else if (coincidenciasParciales.length > 1) {
        // Múltiples coincidencias: requiere aclaración
    return {
          sector: null,
          filtroSQL: null,
          requiereAclaracion: true,
          sectoresCandidatos: coincidenciasParciales
        };
      }
    }
  }
  
  // Si no se detectó sector después de todos los intentos, requiere aclaración
  if (!sectorDetectado) {
    return {
      sector: null,
      filtroSQL: null,
      requiereAclaracion: true,
      sectoresCandidatos: sectoresValidos
    };
  }
  
  // Sector detectado exitosamente
  return {
    sector: sectorDetectado,
    filtroSQL: `%${sectorDetectado}%`,
    requiereAclaracion: false
  };
}

// Función para detectar si falta información crítica en la consulta (MEJORADA)
// ✅ CAPA 3: Ahora usa OpenAI para generar mensajes dinámicos
async function detectarInformacionFaltante(message, dbService, openaiService) {
  const msg = message.toLowerCase().trim();
  
  console.log('🔍 detectarInformacionFaltante - Mensaje:', msg);
  
  // ❌ EXCLUSIONES: Consultas que NO requieren aclaración (son específicas)
  const noRequiereAclaracion = [
    'último mes', 'ultimo mes',
    'últimos', 'ultimos',
    'este mes', 'mes actual',
    'este año', 'año actual',
    'hoy', 'ayer',
    'sector', 'cliente', 'producto',  // Consultas de detalle por entidad
    'top ', 'mejores', 'peores', 'ranking',  // Consultas de ranking
    '2024', '2025', '2023', '2026',  // Años específicos
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  
  if (noRequiereAclaracion.some(exclusion => msg.includes(exclusion))) {
    console.log('✅ Consulta específica, no requiere aclaración');
  return null;
  }
  
  // ✅ Detectar consultas GENÉRICAS que requieren período temporal
  const palabrasGenericas = ['ventas', 'rentabilidad', 'análisis', 'reporte'];
  const esConsultaGenerica = palabrasGenericas.some(palabra => {
    // Verificar si es solo la palabra genérica (sin contexto adicional significativo)
    const regex = new RegExp(`^(dame |muestra |cuánto |quiero )?(las? )?(la )?${palabra}s?$`, 'i');
    return regex.test(msg) || msg === palabra || msg === palabra + 's';
  });
  
  console.log('🔍 esConsultaGenerica:', esConsultaGenerica);
  
  if (!esConsultaGenerica) {
    console.log('✅ No es consulta genérica, tiene suficiente contexto');
    return null;
  }
  
  console.log('❗ Consulta GENÉRICA detectada, requiere aclaración de periodo');
  
  // Determinar tipo de aclaración necesaria
  let tipoAclaracion = 'consulta_general';
  if (msg.includes('comparar') || msg.includes('comparativo') || msg.includes('vs')) {
    tipoAclaracion = 'comparativo';
  } else if (msg.includes('rentabilidad')) {
    tipoAclaracion = 'rentabilidad';
  }
  
  // ✅ CAPA 3: Generar mensaje dinámico usando OpenAI
  const contextoAclaracion = {
    tipo: tipoAclaracion,
    mensaje_usuario: message,
    informacion_faltante: 'periodo_temporal',
    tipo_consulta: tipoAclaracion
  };
  
  try {
    const mensajeGenerado = await generarMensajeAclaracion(
      contextoAclaracion,
      [], // No hay sectores candidatos para este caso
      dbService,
      openaiService
    );
    
    return {
      tipo: tipoAclaracion,
      pregunta: mensajeGenerado
    };
  } catch (error) {
    console.error('❌ Error generando mensaje de aclaración:', error.message);
    // Fallback genérico
    return {
      tipo: tipoAclaracion,
      pregunta: '📅 **¿De qué periodo deseas la información?**\n\nEjemplos:\n• "Del 2025"\n• "Del último mes"\n• "De octubre 2025"\n• "De enero a octubre 2025"'
    };
  }
}

// ⚠️ FUNCIÓN DEPRECADA: Ahora OpenAI genera el SQL dinámicamente
// Mantenida por compatibilidad, pero no se usa
function generarSQLParaConsulta_DEPRECATED(message, estructuraTabla) {
  const msg = message.toLowerCase();
  
  // Buscar columna de monto en la estructura real
  const columnasMonto = ['venta', 'total', 'importe', 'precio', 'monto'];
  const columnaMonto = columnasMonto.find(col => 
    estructuraTabla.toLowerCase().includes(col.toLowerCase())
  ) || 'venta'; // fallback a 'venta' que sabemos que existe
  
  // Buscar columna de fecha en la estructura real
  const columnasFecha = ['fecha', 'date', 'fecha_venta', 'fecha_operacion'];
  const columnaFecha = columnasFecha.find(col => 
    estructuraTabla.toLowerCase().includes(col.toLowerCase())
  ) || 'fecha'; // fallback a 'fecha' que sabemos que existe
  
  // ⚡ PRIORIDAD 1: ÚLTIMO MES (debe ir PRIMERO para evitar conflictos)
  if (msg.includes('último mes') || msg.includes('ultimo mes')) {
    console.log('🎯 DETECTADO último mes - Generando SQL agregado por día');
    return `SELECT 
              DAY(${columnaFecha}) as Dia,
              DATENAME(WEEKDAY, ${columnaFecha}) as DiaSemana,
              SUM(${columnaMonto}) as Ventas,
              COUNT(*) as Transacciones,
              AVG(${columnaMonto}) as PromedioVenta
            FROM Tmp_AnalisisComercial_prueba 
            WHERE ${columnaFecha} >= DATEADD(MONTH, -1, GETDATE())
            GROUP BY DAY(${columnaFecha}), DATENAME(WEEKDAY, ${columnaFecha}), CAST(${columnaFecha} AS DATE)
            ORDER BY CAST(${columnaFecha} AS DATE) ASC`;
  }
  
  // ⚡ PRIORIDAD 2: COMPARATIVO ENTRE DOS AÑOS
  if ((msg.includes('comparativo') || msg.includes('comparar') || msg.includes('vs') || msg.includes('entre')) && 
      (msg.includes('2024') && msg.includes('2025'))) {
    console.log('🎯 DETECTADO COMPARATIVO - Generando SQL con columna Año');
    return `SELECT 
              YEAR(${columnaFecha}) as Año,
              MONTH(${columnaFecha}) as MesNumero,
              CASE MONTH(${columnaFecha})
                WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
                WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
                WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
                WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
              END as Mes,
              SUM(${columnaMonto}) as Ventas,
              COUNT(*) as Transacciones,
              AVG(${columnaMonto}) as PromedioVenta
            FROM Tmp_AnalisisComercial_prueba 
            WHERE YEAR(${columnaFecha}) IN (2024, 2025)
            GROUP BY YEAR(${columnaFecha}), MONTH(${columnaFecha})
            ORDER BY Año, MesNumero ASC`;
  }
  
  // Consulta específica para ventas por mes de un año específico
  if ((msg.includes('tendencia') || msg.includes('ventas')) && msg.includes('2024') && !msg.includes('2025')) {
    console.log('🎯 DETECTADO consulta de 2024 - Generando SQL con nombres de meses');
    return `SELECT MONTH(${columnaFecha}) as MesNumero,
                   CASE MONTH(${columnaFecha})
                     WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
                     WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
                     WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
                     WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
                   END as Mes,
                   SUM(${columnaMonto}) as Ventas,
                   COUNT(*) as Transacciones
            FROM Tmp_AnalisisComercial_prueba 
            WHERE YEAR(${columnaFecha}) = 2024 
            GROUP BY MONTH(${columnaFecha}) 
            ORDER BY MesNumero ASC`;
  }
  
  if ((msg.includes('tendencia') || msg.includes('ventas')) && msg.includes('2025') && !msg.includes('2024')) {
    console.log('🎯 DETECTADO consulta de 2025 - Generando SQL con nombres de meses');
    return `SELECT MONTH(${columnaFecha}) as MesNumero,
                   CASE MONTH(${columnaFecha})
                     WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
                     WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
                     WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
                     WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
                   END as Mes,
                   SUM(${columnaMonto}) as Ventas,
                   COUNT(*) as Transacciones
            FROM Tmp_AnalisisComercial_prueba 
            WHERE YEAR(${columnaFecha}) = 2025 
            GROUP BY MONTH(${columnaFecha}) 
            ORDER BY MesNumero ASC`;
  }
  
  
  // Consulta para ventas de un año específico (datos detallados)
  if (msg.includes('ventas') && msg.includes('año')) {
    const año = msg.match(/(\d{4})/)?.[1] || '2025';
    return `SELECT TOP 100 * FROM Tmp_AnalisisComercial_prueba 
            WHERE YEAR(${columnaFecha}) = ${año}
            ORDER BY ${columnaFecha} DESC`;
  }
  
  // Consulta específica para información de ventas por mes
  if (msg.includes('informacion') && msg.includes('ventas') && msg.includes('mes')) {
    const año = msg.match(/(\d{4})/)?.[1] || '2024';
    return `SELECT MONTH(${columnaFecha}) as MesNumero,
                   CASE MONTH(${columnaFecha})
                     WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
                     WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
                     WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
                     WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
                   END as Mes,
                   SUM(${columnaMonto}) as Ventas,
                   COUNT(*) as Transacciones,
                   AVG(${columnaMonto}) as PromedioVenta
            FROM Tmp_AnalisisComercial_prueba 
            WHERE YEAR(${columnaFecha}) = ${año}
            GROUP BY MONTH(${columnaFecha}) 
            ORDER BY MesNumero ASC`;
  }
  
  // Consulta específica para "ventas de cada mes"
  if (msg.includes('ventas') && msg.includes('cada mes')) {
    const año = msg.match(/(\d{4})/)?.[1] || '2024';
    return `SELECT MONTH(${columnaFecha}) as MesNumero,
                   CASE MONTH(${columnaFecha})
                     WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
                     WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
                     WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
                     WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
                   END as Mes,
                   SUM(${columnaMonto}) as Ventas,
                   COUNT(*) as Transacciones,
                   AVG(${columnaMonto}) as PromedioVenta
            FROM Tmp_AnalisisComercial_prueba 
            WHERE YEAR(${columnaFecha}) = ${año}
            GROUP BY MONTH(${columnaFecha}) 
            ORDER BY MesNumero ASC`;
  }
  
  // Consulta específica para "ventas por mes del año"
  if (msg.includes('ventas') && msg.includes('por mes') && msg.includes('del')) {
    const año = msg.match(/(\d{4})/)?.[1] || '2024';
    return `SELECT MONTH(${columnaFecha}) as MesNumero,
                   CASE MONTH(${columnaFecha})
                     WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
                     WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
                     WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
                     WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
                   END as Mes,
                   SUM(${columnaMonto}) as Ventas,
                   COUNT(*) as Transacciones,
                   AVG(${columnaMonto}) as PromedioVenta
            FROM Tmp_AnalisisComercial_prueba 
            WHERE YEAR(${columnaFecha}) = ${año}
            GROUP BY MONTH(${columnaFecha}) 
            ORDER BY MesNumero ASC`;
  }
  
  // Consulta específica para "informacion de ventas de cada mes del 2024"
  if (msg.includes('informacion') && msg.includes('ventas') && msg.includes('cada mes') && msg.includes('2024')) {
    return `SELECT MONTH(${columnaFecha}) as MesNumero,
                   CASE MONTH(${columnaFecha})
                     WHEN 1 THEN 'Enero'
                     WHEN 2 THEN 'Febrero'
                     WHEN 3 THEN 'Marzo'
                     WHEN 4 THEN 'Abril'
                     WHEN 5 THEN 'Mayo'
                     WHEN 6 THEN 'Junio'
                     WHEN 7 THEN 'Julio'
                     WHEN 8 THEN 'Agosto'
                     WHEN 9 THEN 'Septiembre'
                     WHEN 10 THEN 'Octubre'
                     WHEN 11 THEN 'Noviembre'
                     WHEN 12 THEN 'Diciembre'
                   END as Mes,
                   SUM(${columnaMonto}) as Ventas,
                   COUNT(*) as Transacciones,
                   AVG(${columnaMonto}) as PromedioVenta
            FROM Tmp_AnalisisComercial_prueba 
            WHERE YEAR(${columnaFecha}) = 2024
            GROUP BY MONTH(${columnaFecha})
            ORDER BY MesNumero ASC`;
  }
  
  if (msg.includes('ventas') && msg.includes('mes') && !msg.includes('último mes') && !msg.includes('ultimo mes')) {
    // ✅ CORRECCIÓN: Si no especifica año, usar año actual (2025)
    const añoActual = new Date().getFullYear();
    console.log(`🎯 Consulta de ventas por mes SIN año especificado - usando año actual: ${añoActual}`);
    
    return `SELECT YEAR(${columnaFecha}) as Año,
                   MONTH(${columnaFecha}) as MesNumero,
                   CASE MONTH(${columnaFecha})
                     WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
                     WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
                     WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
                     WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
                   END as Mes,
                   SUM(${columnaMonto}) as Ventas,
                   COUNT(*) as Transacciones
            FROM Tmp_AnalisisComercial_prueba 
            WHERE YEAR(${columnaFecha}) = ${añoActual}
            GROUP BY YEAR(${columnaFecha}), MONTH(${columnaFecha})
            ORDER BY MesNumero ASC`;
  }
  
  // Consulta genérica para ventas
  if (msg.includes('ventas')) {
    return `SELECT TOP 100 * FROM Tmp_AnalisisComercial_prueba 
            ORDER BY ${columnaFecha} DESC`;
  }
  
  return null; // No es una consulta simple reconocida
}

// Ruta de chat SIN autenticación para pruebas (CON OPENAI)
router.post('/chat', validateInput(chatSchema), async (req, res) => {
  try {
    const { message, conversationId, context, userId } = req.body;
    
    console.log(`💬 Procesando mensaje: "${message}"`);
    
    // ⚡ DETECTAR USUARIO ACTUAL (MODO READ-ONLY)
    let currentUser = null;
    let userName = 'Anónimo';
    
    if (userId) {
      // Mapeo simple sin BD (porque no hay permisos)
      const userMap = {
        'admin': 'Administrador',
        'caceres': 'Cáceres'
      };
      userName = userMap[userId] || userId;
      console.log(`👤 Usuario: ${userName} (modo read-only, sin BD)`);
    } else {
      console.log('👤 Usuario: Anónimo');
    }
    
    // ⚡ HISTORIAL: Crear conversación automáticamente si no existe
    let conversationIdForHistory = conversationId;
    
    if (!conversationId) {
      try {
        // Crear conversación automáticamente (modo prueba sin autenticación)
        // Usar título basado en el mensaje (primeras 50 palabras)
        const title = message.length > 100 ? message.substring(0, 100) + '...' : message;
        const newConversation = await dbService.createConversation(
          null, // userId NULL para modo sin autenticación
          title
        );
        conversationIdForHistory = newConversation.id;
        console.log(`✅ Nueva conversación creada automáticamente (ID: ${conversationIdForHistory})`);
      } catch (historyError) {
        console.warn('⚠️ No se pudo crear conversación:', historyError.message);
        conversationIdForHistory = null;
      }
    }
    
    // Obtener tablas disponibles para contexto
    let availableTables = [];
    try {
      const tablesResult = await mcpClient.getTables();
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
    
    // ============================================
    // 🧪 LOGS DE DEBUGGING - INICIO
    // ============================================
    console.log('\n' + '='.repeat(80));
    console.log('🔵 NUEVA CONSULTA RECIBIDA');
    console.log('='.repeat(80));
    console.log('📥 Mensaje original:', message);
    console.log('🕐 Timestamp:', new Date().toISOString());
    console.log('='.repeat(80) + '\n');
    
    // LÓGICA HÍBRIDA: Detectar si es consulta simple o compleja
    let openaiResponse;
    
    if (requiereDatosDeBD(message)) {
      console.log('🔧 Consulta de datos detectada - generando análisis automático');
      
      // ✅ PASO 0: Verificar si falta información crítica (HABILITADO)
      // ✅ CAPA 3: Ahora usa OpenAI para generar mensaje dinámico
      const infoFaltante = await detectarInformacionFaltante(message, dbService, openaiService);
      if (infoFaltante) {
        console.log('❓ Información faltante detectada:', infoFaltante.tipo);
        return res.json({
          success: true,
          response: infoFaltante.pregunta,
          metadata: {
            needsClarification: true,
            clarificationType: infoFaltante.tipo
          }
        });
      }
      
      // ✅ PASO 0.5: Validar sector si se menciona (verificar que existe exactamente en BD)
      // Esta validación se almacenará para uso posterior en el código
      let validacionSectorGlobal = null;
      try {
        console.log('\n' + '='.repeat(80));
        console.log('🔍 PASO 0.5: VALIDACIÓN DE SECTOR');
        console.log('='.repeat(80));
        console.log(`📝 Mensaje a validar: "${message}"`);
        
        validacionSectorGlobal = await detectarSectorExacto(message, mcpClient);
        
        console.log(`📊 Resultado validación:`);
        console.log(`   - Sector detectado: ${validacionSectorGlobal?.sector || 'null'}`);
        console.log(`   - Requiere aclaración: ${validacionSectorGlobal?.requiereAclaracion || false}`);
        console.log(`   - Sectores candidatos: ${validacionSectorGlobal?.sectoresCandidatos?.join(', ') || 'ninguno'}`);
        console.log('='.repeat(80) + '\n');
        
        if (validacionSectorGlobal.requiereAclaracion) {
          console.log('❓ Sector requiere aclaración - GENERANDO MENSAJE CON OPENAI');
          
          // ✅ CAPA 3: Generar mensaje de aclaración usando OpenAI con reglas de BD
          const contextoAclaracion = validacionSectorGlobal.contextoAclaracion || {
            tipo: 'sector_ambiguo',
            mensaje_usuario: message
          };
          
          let preguntaSector;
          try {
            preguntaSector = await generarMensajeAclaracion(
              contextoAclaracion,
              validacionSectorGlobal.sectoresCandidatos,
              dbService,
              openaiService
            );
          } catch (errorGeneracion) {
            console.error('❌ Error generando mensaje, usando fallback:', errorGeneracion.message);
            // Fallback seguro
            const sectoresLista = validacionSectorGlobal.sectoresCandidatos && validacionSectorGlobal.sectoresCandidatos.length > 0
              ? validacionSectorGlobal.sectoresCandidatos.map((s, i) => `${i + 1}. **${s}**`).join('\n')
              : 'No se encontraron sectores en la base de datos';
            
            preguntaSector = `🔍 **Sector no especificado claramente**

Por favor, especifica el sector exacto de tu consulta. Sectores disponibles:

${sectoresLista}

**Ejemplos válidos:**
• "Clientes con mayor rentabilidad sector 2. Minería 2 2025"
• "Ventas del sector 1. Minería 1 en 2025"
• "Rentabilidad sector 4. EFC Corporativo 2025"`;
          }
          
          return res.json({
            success: true,
            response: preguntaSector,
            metadata: {
              needsClarification: true,
              clarificationType: 'sector'
            }
          });
        }
      } catch (errorValidacion) {
        console.error('❌ Error validando sector:', errorValidacion);
        console.warn('⚠️ Error validando sector, continuando sin validación:', errorValidacion.message);
        // Continuar sin validación (fallback)
      }
      
      try {
        // ✅ PASO 1: Normalizar consulta con contexto temporal
        // NOTA: No necesitamos obtener el esquema manualmente aquí
        // La CAPA 1 lo obtiene automáticamente a través del MCP Server
         console.log('📅 Normalizando consulta con contexto temporal...');
         const { mensajeEnriquecido, contextoTemporal } = normalizarConsulta(message);
         
         console.log('🕐 Contexto temporal:', contextoTemporal);
         console.log('📝 Mensaje enriquecido:', mensajeEnriquecido);
         
         // ✅ PASO 2.5: Detectar tipo de análisis
         const tipoAnalisis = detectarTipoAnalisis(message);
         console.log('📊 Tipo de análisis detectado:', tipoAnalisis);
         
         // ✅ PASO 3: Detectar intención (primero mapeo directo, luego avanzado)
         console.log('\n' + '-'.repeat(80));
         console.log('🎯 PASO 3: DETECCIÓN DE INTENCIÓN');
         console.log('-'.repeat(80));
         
         let userIntent = detectarIntencionDirecta(message);
         if (userIntent) {
           console.log('✅ Intención detectada por mapeo directo:', userIntent);
         } else {
           console.log('⚠️ No hay mapeo directo, usando detección avanzada...');
           userIntent = detectUserIntent(message);
           console.log('✅ Intención detectada por algoritmo:', userIntent);
         }
         
         const periodo = `${contextoTemporal.año_mes_anterior}-${contextoTemporal.mes_anterior}`;
         
         console.log('📅 Periodo clave:', periodo);
         console.log('📊 Estadísticas del caché:', getCacheStats());
         console.log('-'.repeat(80) + '\n');
         
         let sqlQuery = null;
         let usandoTemplate = false;
         
         // ✅ PRIORIDAD MÁXIMA: Detectar consultas de clientes con rentabilidad ANTES de todo
         // Definir variables en scope amplio para uso en ambos bloques
         const mensajeLowerTemp = message.toLowerCase();
         const esConsultaClientesPrioridad = mensajeLowerTemp.includes('cliente') || mensajeLowerTemp.includes('clientes');
         const esConsultaRentabilidadPrioridad = mensajeLowerTemp.includes('rentabilidad') || mensajeLowerTemp.includes('rentable');
         const esDetallePrioridad = mensajeLowerTemp.includes('detalle') || mensajeLowerTemp.includes('detalles');
         
         if (esConsultaClientesPrioridad && (esConsultaRentabilidadPrioridad || esDetallePrioridad)) {
           console.log('\n' + '='.repeat(80));
           console.log('🎯 DETECCIÓN PRIORITARIA: CONSULTA DE CLIENTES CON RENTABILIDAD');
           console.log('='.repeat(80));
           console.log('✅ Generando SQL directo para clientes (PRIORIDAD sobre templates)');
           
           // Extraer año si se menciona
           const añoMencionado = mensajeLowerTemp.match(/\b(2024|2025)\b/)?.[1];
           const añoSQL = añoMencionado ? añoMencionado : contextoTemporal.año_actual;
           
           // ✅ USAR SECTOR VALIDADO GLOBALMENTE (ya validado antes con detectarSectorExacto)
           const sectorSQLFilter = validacionSectorGlobal?.filtroSQL || null;
           
           // Determinar orden (menor o mayor rentabilidad)
           const ordenMenor = mensajeLowerTemp.includes('menor');
           const ordenSQL = ordenMenor ? 'ASC' : 'DESC';
           
           console.log(`🔍 SQL Clientes - Sector validado: "${validacionSectorGlobal?.sector || 'N/A'}" (filtro: "${sectorSQLFilter || 'NINGUNO'}")`);
           
           // ✅ Generar SQL directamente - CORRECTO y GARANTIZADO con SECTOR EXACTO
          sqlQuery = `SELECT TOP 20
    tc.[Cliente],
    tc.[Codigo Cliente],
    tac.SECTOR,
    SUM(tac.Venta) as TotalVenta,
    SUM(tac.Costo) as TotalCosto,
    SUM(tac.Venta - tac.Costo) as Rentabilidad,
    CASE WHEN SUM(tac.Costo) > 0 THEN SUM(tac.Venta) / SUM(tac.Costo) ELSE 0 END as Markup,
    CASE WHEN SUM(tac.Venta) > 0 THEN ((SUM(tac.Venta) - SUM(tac.Costo)) / SUM(tac.Venta)) * 100 ELSE 0 END as MargenPct,
    COUNT(*) as NumOperaciones
FROM Tmp_AnalisisComercial_prueba tac
INNER JOIN temporal_cliente tc ON tac.[Codigo Cliente] = tc.[Codigo Cliente]
WHERE 1=1
${añoMencionado ? `AND YEAR(tac.fecha) = ${añoSQL}` : ''}
${sectorSQLFilter ? `AND tac.SECTOR LIKE '${sectorSQLFilter}'` : ''}
GROUP BY tc.[Cliente], tc.[Codigo Cliente], tac.SECTOR
ORDER BY SUM(tac.Venta - tac.Costo) ${ordenSQL}`;
           
           console.log('✅ SQL GENERADO DIRECTAMENTE para CLIENTES:');
           console.log('   ✓ Usa Tmp_AnalisisComercial_prueba + temporal_cliente');
           console.log('   ✓ Agrupa por Cliente, SECTOR');
           console.log('   ✓ SIN filtros de rentabilidad positiva (muestra TODOS)');
           console.log('   ✓ Ordenado por rentabilidad ' + ordenSQL + ' (' + (ordenMenor ? 'menor primero' : 'mayor primero') + ')');
           console.log('='.repeat(80) + '\n');
           usandoTemplate = true;
           // ✅ INCLUIR SECTOR EN CLAVE DE CACHÉ para evitar colisiones entre sectores diferentes
           const sectorParaCache = validacionSectorGlobal?.sector ? validacionSectorGlobal.sector.replace(/[^a-zA-Z0-9]/g, '_') : 'sin_sector';
           const periodoConSector = `${periodo}_${sectorParaCache}`;
           setCachedQuery('clientes_rentabilidad', periodoConSector, sqlQuery);
         } else {
         // 3.1: Intentar obtener del caché (incluyendo sector si existe)
         console.log('\n' + '-'.repeat(80));
         console.log('💾 PASO 3.1: BÚSQUEDA EN CACHÉ');
         console.log('-'.repeat(80));
         
         // ✅ INCLUIR SECTOR EN BÚSQUEDA DE CACHÉ para consultas de clientes con sector
         let cacheKey = periodo;
         if (esConsultaClientesPrioridad && validacionSectorGlobal?.sector) {
           const sectorParaCache = validacionSectorGlobal.sector.replace(/[^a-zA-Z0-9]/g, '_');
           cacheKey = `${periodo}_${sectorParaCache}`;
           console.log(`🔍 Buscando en caché con sector: ${cacheKey}`);
         }
         
         sqlQuery = getCachedQuery(userIntent, cacheKey);
         if (sqlQuery) {
           usandoTemplate = true;
           console.log('✅ ¡SQL encontrado en caché!');
           console.log('⚡ Tiempo de respuesta: ~5ms (INSTANTÁNEO)');
           console.log('📝 SQL desde caché:', sqlQuery.substring(0, 100) + '...');
         } else {
           console.log('❌ No encontrado en caché');
         }
         console.log('-'.repeat(80) + '\n');
         
         // 3.2: Si no está en caché, detectar mes específico y generar SQL directo
        if (!sqlQuery) {
          const mesesMap = {
            'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
            'julio': 7, 'agosto': 8, 'septiembre': 9, 'setiembre': 9, 'octubre': 10,
            'noviembre': 11, 'diciembre': 12
          };
          
          const msgLower = message.toLowerCase();
          let mesDetectado = null;
          let mesNumero = null;
          
          for (const [nombre, numero] of Object.entries(mesesMap)) {
            if (msgLower.includes(nombre)) {
              mesDetectado = nombre;
              mesNumero = numero;
              break;
            }
          }
          
          if (mesDetectado) {
            console.log(`✅ MES ESPECÍFICO DETECTADO: ${mesDetectado} (${mesNumero})`);
            const año = msgLower.includes('2024') ? 2024 : (msgLower.includes('2025') ? 2025 : contextoTemporal.año_actual);
            
            sqlQuery = `SELECT 
    YEAR(fecha) as Año,
    MONTH(fecha) as MesNumero,
    CASE MONTH(fecha)
      WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
      WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
      WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
      WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
    END as Mes,
    SUM(venta) as Ventas,
    COUNT(*) as Transacciones,
    AVG(venta) as PromedioVenta
FROM Tmp_AnalisisComercial_prueba
WHERE YEAR(fecha) = ${año}
  AND MONTH(fecha) = ${mesNumero}
GROUP BY YEAR(fecha), MONTH(fecha)`;
            
            console.log(`✅ SQL GENERADO DIRECTAMENTE para ${mesDetectado} ${año}`);
            usandoTemplate = true;
            setCachedQuery(userIntent, periodo, sqlQuery);
          }
        }
        
        // 3.3: Si no hay mes específico, intentar usar template predefinido
        if (!sqlQuery) {
          console.log('\n' + '-'.repeat(80));
          console.log('📋 PASO 3.3: BÚSQUEDA EN TEMPLATES');
          console.log('-'.repeat(80));
          
          sqlQuery = getQueryFromTemplate(userIntent, contextoTemporal);
          
          if (sqlQuery) {
            console.log('✅ ¡Template encontrado!');
            console.log('⚡ Tiempo de respuesta: ~50ms (RÁPIDO)');
            console.log('📝 SQL desde template:', sqlQuery.substring(0, 100) + '...');
            usandoTemplate = true;
            // Guardar en caché para próximas consultas
            setCachedQuery(userIntent, periodo, sqlQuery);
            console.log('💾 SQL guardado en caché para futuras consultas');
          } else {
            console.log('❌ No hay template para esta intención');
          }
          console.log('-'.repeat(80) + '\n');
        }
         
        // 3.3: Si no hay template, usar OpenAI con arquitectura de 3 capas
         if (!sqlQuery) {
           console.log('\n' + '-'.repeat(80));
          console.log('🤖 PASO 3.3: GENERACIÓN CON OPENAI (Arquitectura de 3 Capas)');
           console.log('-'.repeat(80));
           console.log('⚠️ No hay caché ni template disponible');
           console.log('🧠 Solicitando a OpenAI que genere SQL...');
          console.log('📊 Usando arquitectura de 3 capas:');
          console.log('   🔷 CAPA 1: Esquema dinámico (MCP Server)');
          console.log('   🔷 CAPA 2: Reglas SQL genéricas (MCP Server)');
          console.log('   🔷 CAPA 3: Reglas de negocio (BD - EDITABLE desde frontend)');
          console.log('⏱️ Tiempo estimado: ~2000ms');
           console.log('-'.repeat(80) + '\n');
         
          // ✅ USAR ARQUITECTURA DE 3 CAPAS (sin prompts hardcodeados)
          // El mensaje incluye contexto temporal y es procesado por openaiService.chat()
          // que automáticamente combina las 3 capas
          
          // ✅ Detectar tipo de consulta para instrucciones específicas
          const mensajeLower = message.toLowerCase();
          const esConsultaClientes = mensajeLower.includes('cliente') || mensajeLower.includes('clientes');
          const esConsultaRentabilidad = mensajeLower.includes('rentabilidad') || mensajeLower.includes('rentable');
          const esDetalle = mensajeLower.includes('detalle') || mensajeLower.includes('detalles');
          
          // 🐛 DEBUG: Log de detección
          console.log('🔍 Detección de tipo de consulta:');
          console.log(`   - esConsultaClientes: ${esConsultaClientes}`);
          console.log(`   - esConsultaRentabilidad: ${esConsultaRentabilidad}`);
          console.log(`   - esDetalle: ${esDetalle}`);
          
          // ✅ SOLUCIÓN DIRECTA: Para consultas de clientes con rentabilidad, generar SQL directamente
          if (esConsultaClientes && (esConsultaRentabilidad || esDetalle)) {
            console.log('✅ CONSULTA DETECTADA: ANÁLISIS DE CLIENTES CON RENTABILIDAD');
            console.log('🎯 GENERANDO SQL DIRECTO (sin OpenAI tools) para evitar problemas...');
            
            // Extraer año si se menciona
            const añoMencionado = mensajeLower.match(/\b(2024|2025)\b/)?.[1];
            const añoSQL = añoMencionado ? añoMencionado : contextoTemporal.año_actual;
            
            // ✅ USAR SECTOR VALIDADO GLOBALMENTE (ya validado antes con detectarSectorExacto)
            const sectorSQLFilter = validacionSectorGlobal?.filtroSQL || null;
            console.log(`🔍 SQL Clientes (OpenAI) - Sector validado: "${validacionSectorGlobal?.sector || 'N/A'}" (filtro: "${sectorSQLFilter || 'NINGUNO'}")`);
            
            // Determinar orden (menor o mayor rentabilidad)
            const ordenMenor = mensajeLower.includes('menor');
            const ordenSQL = ordenMenor ? 'ASC' : 'DESC';
            
            // ✅ Generar SQL directamente - CORRECTO y GARANTIZADO con SECTOR EXACTO
            // Incluye JOIN con temporal_cliente para obtener Codigo Cliente y nombre del Cliente
            sqlQuery = `SELECT TOP 20
    tc.[Cliente],
    tc.[Codigo Cliente],
    tac.SECTOR,
    SUM(tac.Venta) as TotalVenta,
    SUM(tac.Costo) as TotalCosto,
    SUM(tac.Venta - tac.Costo) as Rentabilidad,
    CASE WHEN SUM(tac.Costo) > 0 THEN SUM(tac.Venta) / SUM(tac.Costo) ELSE 0 END as Markup,
    CASE WHEN SUM(tac.Venta) > 0 THEN ((SUM(tac.Venta) - SUM(tac.Costo)) / SUM(tac.Venta)) * 100 ELSE 0 END as MargenPct,
    COUNT(*) as NumOperaciones
FROM Tmp_AnalisisComercial_prueba tac
INNER JOIN temporal_cliente tc ON tac.[Codigo Cliente] = tc.[Codigo Cliente]
WHERE 1=1
${añoMencionado ? `AND YEAR(tac.fecha) = ${añoSQL}` : ''}
${sectorSQLFilter ? `AND tac.SECTOR LIKE '${sectorSQLFilter}'` : ''}
GROUP BY tc.[Cliente], tc.[Codigo Cliente], tac.SECTOR
ORDER BY SUM(tac.Venta - tac.Costo) ${ordenSQL}`;
            
            console.log('✅ SQL GENERADO DIRECTAMENTE (sin OpenAI):');
            console.log('   ✓ Usa Tmp_AnalisisComercial_prueba (tiene SECTOR, Venta, Costo)');
            console.log('   ✓ Agrupa por Cliente, SECTOR');
            console.log('   ✓ SIN filtros de rentabilidad positiva (muestra TODOS)');
            console.log('   ✓ Ordenado por rentabilidad ' + ordenSQL + ' (' + (ordenMenor ? 'menor primero' : 'mayor primero') + ')');
            console.log('   SQL:', sqlQuery);
            usandoTemplate = true;
            // ✅ INCLUIR SECTOR EN CLAVE DE CACHÉ para evitar colisiones entre sectores diferentes
            const sectorParaCache = validacionSectorGlobal?.sector ? validacionSectorGlobal.sector.replace(/[^a-zA-Z0-9]/g, '_') : 'sin_sector';
            const periodoConSector = `${periodo}_${sectorParaCache}`;
            setCachedQuery(userIntent, periodoConSector, sqlQuery);
          } else {
            // Para otras consultas, usar OpenAI normalmente
            let instruccionesEspecificas = '';
            let temperature = 0.3; // Default
            
            if (false) { // Esto nunca se ejecuta ahora, pero lo dejo por si acaso
              console.log('✅ CONSULTA DETECTADA: ANÁLISIS DE CLIENTES CON RENTABILIDAD');
              // ✅ CONSULTA DE CLIENTES CON RENTABILIDAD
              instruccionesEspecificas = `

[⚠️ TIPO DE CONSULTA: ANÁLISIS DE CLIENTES]
Esta consulta requiere:
1. **SELECCIONAR LA TABLA CORRECTA según las columnas necesarias:**
   - Si necesitas **SECTOR, Venta, Costo, fecha**: Usa **Tmp_AnalisisComercial_prueba**
   - Si necesitas columnas que solo están en **temporal_cliente**: Usa esa tabla
   - **IMPORTANTE**: Revisa el esquema que tienes disponible - cada tabla tiene columnas específicas
2. **AGRUPAR POR CLIENTE** (GROUP BY Cliente, SECTOR si usas Tmp_AnalisisComercial_prueba)
3. **CALCULAR RENTABILIDAD por cliente**: SUM(Venta - Costo) as Rentabilidad
4. **ORDENAR por rentabilidad** ASC (menor) o DESC (mayor) según lo solicitado
5. **INCLUIR columnas**: Cliente, SECTOR, TotalVenta (SUM(Venta)), TotalCosto (SUM(Costo)), Rentabilidad, Markup, NumOperaciones (COUNT(*))
6. **USAR TOP 20** para limitar resultados
7. **FILTRAR por sector** si se menciona: WHERE SECTOR LIKE '%Minería%' (buscar el sector en el texto)
8. **FILTRAR por año** si se menciona: WHERE YEAR(fecha) = 2025

**EJEMPLO SQL PARA "Detalle de clientes con menor rentabilidad sector 1. Minería 1 2025":**
\`\`\`sql
-- Usar Tmp_AnalisisComercial_prueba porque necesitamos SECTOR, Venta, Costo
SELECT TOP 20
    Cliente,
    SECTOR,
    SUM(Venta) as TotalVenta,
    SUM(Costo) as TotalCosto,
    SUM(Venta - Costo) as Rentabilidad,
    CASE WHEN SUM(Costo) > 0 THEN SUM(Venta) / SUM(Costo) ELSE 0 END as Markup,
    COUNT(*) as NumOperaciones
FROM Tmp_AnalisisComercial_prueba
WHERE SECTOR LIKE '%Minería%'
    AND YEAR(fecha) = 2025
GROUP BY Cliente, SECTOR
ORDER BY SUM(Venta - Costo) ASC
\`\`\`

⚠️ **REGLAS IMPORTANTES:**
- **Selecciona la tabla basándote en las columnas que necesitas** - el esquema te dice qué columnas tiene cada tabla
- Si necesitas filtrar/agrupar por **SECTOR**: Usa **Tmp_AnalisisComercial_prueba** (temporal_cliente NO tiene columna SECTOR)
- Si necesitas columnas específicas de **temporal_cliente**: Usa esa tabla, pero NO intentes acceder a columnas que no tiene
- ❌ NO agrupes por mes o periodo cuando el usuario pide "clientes"
- ❌ NO generes SQL que agrupe por YEAR(fecha), MONTH(fecha) si la consulta es sobre clientes
- ✅ SIEMPRE agrupa por Cliente cuando el usuario dice "clientes", "detalle de clientes", etc.`;
              // ✅ Reducir temperatura para mayor consistencia en consultas de clientes
              temperature = 0.1;
            } else if (mensajeLower.includes('ventas') && !esConsultaClientes) {
              console.log('✅ CONSULTA DETECTADA: ANÁLISIS TEMPORAL DE VENTAS');
              // ✅ CONSULTA DE VENTAS (NO de clientes)
              instruccionesEspecificas = `

[⚠️ TIPO DE CONSULTA: ANÁLISIS TEMPORAL DE VENTAS]
Esta consulta requiere:
1. **AGRUPAR POR PERIODO** (YEAR(fecha), MONTH(fecha)) o por mes/año
2. **CALCULAR ventas por periodo**: SUM(venta) as Ventas
3. **INCLUIR columnas**: Año, Mes, Ventas, Transacciones, PromedioVenta
4. **ORDENAR cronológicamente**: ORDER BY Año, MesNumero`;
            }
            
            const mensajeConContexto = `${mensajeEnriquecido}

[📅 CONTEXTO TEMPORAL]
- Fecha actual: ${contextoTemporal.fecha_actual}
- Año actual: ${contextoTemporal.año_actual}
- Mes actual: ${contextoTemporal.mes_actual} (${contextoTemporal.nombre_mes_actual})
- Mes anterior: ${contextoTemporal.mes_anterior} (${contextoTemporal.nombre_mes_anterior} ${contextoTemporal.año_mes_anterior})

[📝 INSTRUCCIONES GENERALES]
Genera el SQL apropiado para esta consulta. 
El sistema ya tiene acceso al esquema de la base de datos y a las reglas SQL genéricas.
Las reglas de negocio están configuradas y son editables desde el frontend.

${instruccionesEspecificas}`;

          // ✅ openaiService.chat() automáticamente combina las 3 capas:
          // - CAPA 1: Esquema dinámico del MCP Server
          // - CAPA 2: Reglas SQL genéricas del MCP Server (incluye regla de comparación justa)
          // - CAPA 3: Reglas de negocio de la BD (editables desde frontend)
            const sqlResponse = await openaiService.chat(mensajeConContexto, [], {
              temperature: temperature,
              model: 'gpt-4-turbo-preview'
              // ✅ NO usar systemPromptOverride - deja que openaiService.chat() use las 3 capas
            });
            sqlQuery = sqlResponse.content.trim();
            
            console.log(`🌡️ Temperature usada: ${temperature} (${temperature === 0.1 ? 'máxima consistencia para consultas de clientes' : 'consistencia con flexibilidad'})`);
            
            // Limpiar markdown si existe
            sqlQuery = sqlQuery.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
            
            console.log('✅ SQL generado por OpenAI:', sqlQuery);
          } // Fin del else (cuando NO es consulta de clientes con rentabilidad)
          
          // ⚠️ VALIDACIÓN ADICIONAL (solo para otras consultas que usaron OpenAI)
          // Para consultas de clientes, ya se generó SQL directo arriba
          if (sqlQuery && !(esConsultaClientes && (esConsultaRentabilidad || esDetalle))) {
            const tieneGroupByCliente = /GROUP BY.*\bCLIENTE\b/i.test(sqlQuery);
            const tieneGroupByPeriodo = /GROUP BY.*\b(YEAR|MONTH|AÑO|MES|PERIODO)\b/i.test(sqlQuery);
            const usaTemporalCliente = /temporal_cliente|tc\.|c\.|FROM\s+\[?temporal_cliente\]?/i.test(sqlQuery);
            // Detectar filtros de rentabilidad positiva (cualquier variación)
            const tieneFiltroRentabilidadPositiva = /HAVING.*\((.*Venta.*-.*Costo|.*Costo.*-.*Venta|.*rentabilidad).*\)\s*>\s*0/i.test(sqlQuery) ||
                                                   /HAVING.*rentabilidad.*>\s*0/i.test(sqlQuery) ||
                                                   /WHERE.*rentabilidad.*>\s*0/i.test(sqlQuery);
            const usaTmpAnalisisCorrecto = /FROM\s+Tmp_AnalisisComercial_prueba/i.test(sqlQuery);
            
            // ✅ Verificar si el SQL generado es correcto
            const esSQLCorrecto = tieneGroupByCliente && 
                                  !tieneGroupByPeriodo && 
                                  !usaTemporalCliente && 
                                  !tieneFiltroRentabilidadPositiva &&
                                  usaTmpAnalisisCorrecto;
            
            // Si NO es correcto, reemplazar completamente
            if (!esSQLCorrecto) {
              let motivo = [];
              if (usaTemporalCliente) motivo.push('usa temporal_cliente');
              if (tieneGroupByPeriodo && !tieneGroupByCliente) motivo.push('agrupa por periodo');
              if (tieneFiltroRentabilidadPositiva) motivo.push('filtra rentabilidad positiva');
              if (!usaTmpAnalisisCorrecto) motivo.push('no usa Tmp_AnalisisComercial_prueba');
              
              console.error(`❌ SQL generado NO es adecuado para consulta de clientes: ${motivo.join(', ')}`);
              console.error('   SQL original:', sqlQuery.substring(0, 400) + '...');
              console.log('🔧 REEMPLAZANDO: Generando SQL correcto usando Tmp_AnalisisComercial_prueba...');
              
              // ✅ CORRECCIÓN AUTOMÁTICA: Reemplazar GROUP BY de periodo por GROUP BY Cliente
              // Extraer año si se menciona en la consulta
              const añoMencionado = mensajeLower.match(/\b(2024|2025)\b/)?.[1];
              const añoSQL = añoMencionado ? añoMencionado : contextoTemporal.año_actual;
              
              // ✅ USAR SECTOR VALIDADO (ya validado antes en validacionSectorGlobal)
              const sectorSQLFilter = validacionSectorGlobal?.filtroSQL || null;
              
              // ✅ Construir SQL corregido - SIN FILTROS DE RENTABILIDAD POSITIVA
              // IMPORTANTE: Mostrar TODOS los clientes (positivos y negativos) ordenados por rentabilidad ASC (menor primero)
              sqlQuery = `SELECT TOP 20
    Cliente,
    SECTOR,
    SUM(Venta) as TotalVenta,
    SUM(Costo) as TotalCosto,
    SUM(Venta - Costo) as Rentabilidad,
    CASE WHEN SUM(Costo) > 0 THEN SUM(Venta) / SUM(Costo) ELSE 0 END as Markup,
    COUNT(*) as NumOperaciones
FROM Tmp_AnalisisComercial_prueba
WHERE 1=1
${añoMencionado ? `AND YEAR(fecha) = ${añoSQL}` : ''}
${sectorSQLFilter ? `AND SECTOR LIKE '${sectorSQLFilter}'` : ''}
GROUP BY Cliente, SECTOR
ORDER BY SUM(Venta - Costo) ASC`;
              
              console.log('✅ SQL CORREGIDO:');
              console.log('   ✓ Usa Tmp_AnalisisComercial_prueba (tiene SECTOR, Venta, Costo)');
              console.log('   ✓ Agrupa por Cliente, SECTOR');
              console.log('   ✓ SIN filtros de rentabilidad positiva (muestra TODOS)');
              console.log('   ✓ Ordenado por rentabilidad ASC (menor primero)');
              console.log('   SQL corregido:', sqlQuery.substring(0, 250) + '...');
            } else if (!tieneGroupByCliente) {
              console.warn('⚠️ ADVERTENCIA: SQL generado NO agrupa por CLIENTE');
              console.warn('   SQL:', sqlQuery.substring(0, 200) + '...');
            }
          }
          
          // Guardar en caché para próximas consultas (solo si no es consulta prioritaria de clientes)
          if (sqlQuery && !(esConsultaClientesPrioridad && (esConsultaRentabilidadPrioridad || esDetallePrioridad))) {
          setCachedQuery(userIntent, periodo, sqlQuery);
          }
          } // Fin del if (!sqlQuery) - bloque de OpenAI
        } // Fin del else (bloque de templates/OpenAI)
        
        // NOTA: Si es consulta de clientes con rentabilidad, ya se generó SQL arriba y no entra aquí
        
        console.log('📝 SQL FINAL que se ejecutará:', sqlQuery);
        
        // Validar que sea un SELECT válido
        if (!sqlQuery || !sqlQuery.toLowerCase().includes('select')) {
          console.error('❌ ERROR: SQL generado no es válido');
          return res.status(500).json({
            success: false,
            error: 'No pude generar una consulta SQL válida. Por favor, intenta reformular tu pregunta.',
            suggestion: 'Ejemplos: "ventas del último mes", "ventas del 2025", "comparativo 2024 vs 2025"'
          });
        }
        
        // ⚡ CORRECCIÓN AUTOMÁTICA: Detectar y corregir filtros incorrectos de sectores
        console.log('\n🔧 Validando filtros de sector...');
        
        // Detectar si hay filtros de sector con = en lugar de LIKE
        const sectorFiltersIncorrectos = [
          /WHERE\s+(\w+\.)?SECTOR\s*=\s*'([^']+)'/gi,
          /WHERE\s+(\w+\.)?Sector\s*=\s*'([^']+)'/gi,
          /AND\s+(\w+\.)?SECTOR\s*=\s*'([^']+)'/gi,
          /AND\s+(\w+\.)?Sector\s*=\s*'([^']+)'/gi,
          /OR\s+(\w+\.)?SECTOR\s*=\s*'([^']+)'/gi,
          /OR\s+(\w+\.)?Sector\s*=\s*'([^']+)'/gi
        ];
        
        let sqlCorregido = sqlQuery;
        let huboCorrecciones = false;
        
        // PASO 1: Corregir filtros con = y cambiar a LIKE
        for (const regex of sectorFiltersIncorrectos) {
          if (regex.test(sqlCorregido)) {
            console.log('❌ Detectado filtro incorrecto de sector con =');
            
            // Corregir: reemplazar = por LIKE con wildcards
            // IMPORTANTE: Solo buscar en t.SECTOR (temporal_cliente NO tiene columna Sector)
            sqlCorregido = sqlCorregido.replace(regex, (match, tabla, valor) => {
              const operador = match.split(/\s+/)[0]; // WHERE, AND, OR
              
              huboCorrecciones = true;
              console.log(`✅ Corrigiendo: ${match}`);
              console.log(`   → ${operador} t.SECTOR LIKE '%${valor}%'`);
              
              return `${operador} t.SECTOR LIKE '%${valor}%'`;
            });
          }
        }
        
        // PASO 2: CORREGIR referencias a tc.Sector, c.Sector, etc. (temporal_cliente NO tiene Sector)
        // IMPORTANTE: NO tocar tac.SECTOR (que es CORRECTO) ni cualquier cosa que empiece con "tac"
        // Solo buscar referencias específicas incorrectas: tc.Sector, c.Sector, temporal_cliente.Sector
        const tieneTcSector = /tc\.\s*\[?Sector\]?\b/i.test(sqlCorregido);
        const tieneCSector = /\bc\.\s*\[?Sector\]?\b/i.test(sqlCorregido);
        const tieneTemporalClienteSector = /temporal_cliente\.\s*\[?Sector\]?\b/i.test(sqlCorregido);
        const tieneClienteSector = /\bcliente\.\s*\[?Sector\]?\b/i.test(sqlCorregido);
        const tieneSectorIncorrecto = tieneTcSector || tieneCSector || tieneTemporalClienteSector || tieneClienteSector;
        
        // Solo corregir si realmente hay referencias incorrectas, y NO si ya está usando tac.SECTOR correctamente
        if (tieneSectorIncorrecto) {
          console.log('⚠️ Detectado Sector desde temporal_cliente (NO EXISTE) - corrigiendo a tac.SECTOR');
          
          // CRÍTICO: Reemplazar SOLO tc.Sector, c.Sector, temporal_cliente.Sector, cliente.Sector
          // IMPORTANTE: NO reemplazar "tac" porque es el alias CORRECTO de Tmp_AnalisisComercial_prueba
          sqlCorregido = sqlCorregido.replace(/\btc\.\s*\[?Sector\]?\b/gi, 'tac.SECTOR');
          sqlCorregido = sqlCorregido.replace(/\bc\.\s*\[?Sector\]?\b/gi, 'tac.SECTOR');
          sqlCorregido = sqlCorregido.replace(/\btemporal_cliente\.\s*\[?Sector\]?\b/gi, 'tac.SECTOR');
          sqlCorregido = sqlCorregido.replace(/\bcliente\.\s*\[?Sector\]?\b/gi, 'tac.SECTOR');
          
          // Corregir en WHERE: tc.Sector = 'X' → tac.SECTOR LIKE '%X%'
          sqlCorregido = sqlCorregido.replace(/(WHERE|AND|OR)\s+(tc|c|temporal_cliente|cliente)\.\s*\[?Sector\]?\s*=\s*'([^']+)'/gi, 
            "$1 tac.SECTOR LIKE '%$3%'");
          
          // Eliminar de GROUP BY si está agrupando por tc.Sector (pero mantener tac.SECTOR si existe)
          sqlCorregido = sqlCorregido.replace(/,\s*(tc|c|temporal_cliente|cliente)\.\s*\[?Sector\]?\b/gi, '');
          sqlCorregido = sqlCorregido.replace(/\b(tc|c|temporal_cliente|cliente)\.\s*\[?Sector\]?,\s*/gi, '');
          
          huboCorrecciones = true;
        }
        
        // PASO 2b: Eliminar HAVING que filtre rentabilidad positiva
        if (/HAVING\s+.*\((.*Venta.*-.*Costo|.*Costo.*-.*Venta|.*rentabilidad).*\)\s*>\s*0/i.test(sqlCorregido) ||
            /HAVING\s+.*rentabilidad\s*>\s*0/i.test(sqlCorregido)) {
          console.log('⚠️ Detectado HAVING que filtra rentabilidad positiva - ELIMINANDO para mostrar TODOS los clientes');
          sqlCorregido = sqlCorregido.replace(/HAVING\s+.*\((.*Venta.*-.*Costo|.*Costo.*-.*Venta|.*rentabilidad).*\)\s*>\s*0/gi, '');
          sqlCorregido = sqlCorregido.replace(/HAVING\s+.*rentabilidad\s*>\s*0/gi, '');
          huboCorrecciones = true;
        }
        
        // PASO 3: Asegurar que usa tac.SECTOR (alias correcto de Tmp_AnalisisComercial_prueba)
        // Primero detectar si usa alias 't' o sin alias
        const usaAliasT = /FROM\s+Tmp_AnalisisComercial_prueba\s+(?:AS\s+)?t\b/i.test(sqlCorregido);
        const aliasCorrecto = usaAliasT ? 't.SECTOR' : 'tac.SECTOR';
        
        // Si no tiene alias en SECTOR, agregarlo según el alias detectado
        if (!/\.\s*SECTOR/i.test(sqlCorregido.replace(/tc\.|c\.|temporal_cliente\./gi, ''))) {
          sqlCorregido = sqlCorregido.replace(/WHERE\s+SECTOR\s+/gi, `WHERE ${aliasCorrecto} `);
          sqlCorregido = sqlCorregido.replace(/AND\s+SECTOR\s+/gi, `AND ${aliasCorrecto} `);
          sqlCorregido = sqlCorregido.replace(/OR\s+SECTOR\s+/gi, `OR ${aliasCorrecto} `);
        }
        
        // Corregir LIMIT por TOP (SQL Server)
        if (sqlCorregido.toLowerCase().includes('limit')) {
          console.log('⚠️ Detectado LIMIT (MySQL) - corrigiendo a TOP (SQL Server)');
          sqlCorregido = sqlCorregido.replace(/LIMIT\s+(\d+)/gi, '');
          sqlCorregido = sqlCorregido.replace(/SELECT\s+/i, 'SELECT TOP $1 ');
          huboCorrecciones = true;
        }
        
        // Corregir TOP 1 a TOP 20 para análisis de clientes
        if (/SELECT\s+TOP\s+1\s/i.test(sqlCorregido) && sqlCorregido.toLowerCase().includes('group by')) {
          console.log('⚠️ Detectado TOP 1 con GROUP BY - cambiando a TOP 20 para análisis múltiple');
          sqlCorregido = sqlCorregido.replace(/SELECT\s+TOP\s+1\s/i, 'SELECT TOP 20 ');
          huboCorrecciones = true;
        }
        
        if (huboCorrecciones) {
          console.log('\n✅ SQL CORREGIDO AUTOMÁTICAMENTE:');
          console.log(sqlCorregido);
          sqlQuery = sqlCorregido;
        } else {
          console.log('✅ No se requieren correcciones');
        }
        
        console.log('📝 SQL final a ejecutar:', sqlQuery);
        
        // Ejecutar la consulta SQL
        console.log('🔧 Ejecutando consulta SQL...');
        const queryResult = await mcpClient.executeQuery(sqlQuery);
        
        // MOSTRAR LOS DATOS REALES EN EL LOG
        console.log('📊 Datos obtenidos:', queryResult);
        if (queryResult.content && queryResult.content[0]) {
          const data = JSON.parse(queryResult.content[0].text);
          console.log('📈 Datos parseados:', data);
          console.log(`📋 Total de filas: ${data.rowCount}`);
          if (data.data && data.data.length > 0) {
            console.log('🔍 Primera fila:', data.data[0]);
          }
        }
        
        // Procesar resultados con OpenAI para análisis COMPLETO
        const dataForAI = queryResult.content ? JSON.parse(queryResult.content[0].text) : null;
        
        // ⚠️ VALIDACIÓN: Si no hay datos, retornar mensaje útil
        if (!dataForAI || !dataForAI.data || dataForAI.data.length === 0) {
          console.log('⚠️ La query no retornó datos');
          
          // Definir mensajeLower para uso en este bloque
          const mensajeLower = (message || '').toLowerCase();
          
          // Extraer el sector/filtro del mensaje original
          const sectorMatch = message.match(/sector\s+.*?(\d+\.?\s*)?([A-Za-zÁ-ú]+)/i);
          const sector = sectorMatch ? sectorMatch[2] : 'especificado';
          
          // ✅ Extraer año mencionado en la consulta (para mensaje de error)
          const añoMencionado = mensajeLower.match(/\b(2024|2025)\b/)?.[1];
          
          // ✅ Detectar tipo de consulta para mensaje más específico
          const esConsultaClientes = mensajeLower.includes('cliente') || mensajeLower.includes('clientes');
          const esConsultaRentabilidad = mensajeLower.includes('rentabilidad') || mensajeLower.includes('rentable');
          
          let mensajeSinDatos;
          
          if (esConsultaClientes && esConsultaRentabilidad) {
            mensajeSinDatos = `⚠️ **No se encontraron clientes para la consulta solicitada**

**Consulta:** "${message}"

**Nota importante:** La consulta busca TODOS los clientes (con rentabilidad positiva Y negativa) para identificar cuáles tienen menor rentabilidad. 

**Posibles causas:**

1. 📊 **No hay operaciones registradas** para el sector "${sector}" en ${añoMencionado || 'el año especificado'}
2. 🔍 **El nombre del sector puede estar escrito diferente** en la base de datos (ej: "1. Minería 1" vs "Minería")
3. ⚠️ **Verifica el filtro de sector** - puede que el sector se llame diferente (ej: "1. Minería 1" debe buscarse como "Minería")

**Sugerencias:**

✅ Prueba sin especificar el número: "Clientes con menor rentabilidad sector Minería 2025"
✅ Verifica todos los sectores disponibles: "¿Qué sectores tenemos?"
✅ Intenta con consulta más amplia: "Clientes con menor rentabilidad en 2025" (sin sector)

**SQL ejecutado:** 
\`\`\`sql
${sqlQuery.substring(0, 300)}${sqlQuery.length > 300 ? '...' : ''}
\`\`\`

💡 **Tip:** El SQL NO filtra por rentabilidad positiva - muestra TODOS los clientes ordenados por rentabilidad (menor primero)`;
          } else {
            mensajeSinDatos = `⚠️ **No se encontraron datos para la consulta solicitada**

**Consulta:** "${message}"

**Posibles causas:**

1. 📊 **No hay operaciones registradas** para el sector "${sector}" en la base de datos
2. 🔍 **Los filtros son muy restrictivos** - puede que los datos existan pero no cumplan todos los criterios
3. ✍️ **El nombre del sector puede estar escrito diferente** en la base de datos

**Sugerencias:**

✅ Verifica que el sector esté escrito correctamente (ejemplos: "Minería", "Energía", "Construcción")
✅ Intenta con una consulta más amplia: "Clientes con menor rentabilidad" (sin especificar sector)
✅ Prueba listar todos los sectores disponibles: "¿Qué sectores tenemos?"

**SQL ejecutado:** 
\`\`\`sql
${sqlQuery.substring(0, 300)}${sqlQuery.length > 300 ? '...' : ''}
\`\`\`

💡 **Tip:** Si necesitas ver todos los datos disponibles, pregunta "Muestra todos los sectores con datos"`;
          }

          return res.json({
            success: true,
            response: {
              content: mensajeSinDatos,
              mcpToolUsed: 'execute_query',
              sqlQuery: sqlQuery,
              executionTime: queryResult.executionTime,
              reasoning: 'Query ejecutada correctamente pero sin resultados',
              rawData: queryResult,
              dataPreview: dataForAI
            },
            metadata: {
              periodo_analizado: `${contextoTemporal.nombre_mes_anterior} ${contextoTemporal.año_mes_anterior}`,
              tipo_analisis: tipoAnalisis,
              usando_template: usandoTemplate,
              intencion_detectada: userIntent,
              sin_datos: true
            }
          });
        }
        
        // ✅ CALCULAR TOTALES REALES ANTES DE ENVIAR A OPENAI
        let totalCalculado2024 = 0;
        let totalCalculado2025 = 0;
        let totalesRentabilidad = null; // Para consultas de rentabilidad
        
        // Detectar si la consulta es de rentabilidad
        const mensajeLowerAnalisis = (message || '').toLowerCase();
        const esConsultaRentabilidadTemp = mensajeLowerAnalisis.includes('rentabilidad') || mensajeLowerAnalisis.includes('rentable');
        
        if (dataForAI && dataForAI.data) {
          dataForAI.data.forEach(row => {
            if (row.Año === 2024 && row.Ventas) {
              totalCalculado2024 += parseFloat(row.Ventas);
            } else if (row.Año === 2025 && row.Ventas) {
              totalCalculado2025 += parseFloat(row.Ventas);
            }
          });
          
          // ✅ Si es consulta de rentabilidad, calcular totales de Venta, Costo y Rentabilidad
          if (esConsultaRentabilidadTemp && dataForAI.data.length > 0) {
            const primeraFila = dataForAI.data[0];
            const columnas = Object.keys(primeraFila);
            
            // Detectar columnas (flexible con diferentes nombres)
            const colVenta = columnas.find(c => 
              ['totalventa', 'venta', 'ventas'].includes(c.toLowerCase())
            );
            const colCosto = columnas.find(c => 
              ['totalcosto', 'costo', 'costos'].includes(c.toLowerCase())
            );
            const colRent = columnas.find(c => 
              ['rentabilidad', 'rentable'].includes(c.toLowerCase())
            );
            
            if (colVenta || colCosto || colRent) {
              let sumVenta = 0;
              let sumCosto = 0;
              let sumRent = 0;
              
              dataForAI.data.forEach(row => {
                if (colVenta) sumVenta += parseFloat(row[colVenta]) || 0;
                if (colCosto) sumCosto += parseFloat(row[colCosto]) || 0;
                if (colRent) sumRent += parseFloat(row[colRent]) || 0;
              });
              
              // Si no hay columna de rentabilidad, calcularla
              if (!colRent && colVenta && colCosto) {
                sumRent = sumVenta - sumCosto;
              }
              
              // Calcular métricas derivadas
              const margenPct = sumVenta > 0 ? ((sumRent / sumVenta) * 100) : 0;
              const markupGlobal = sumCosto > 0 ? (sumVenta / sumCosto) : 0;
              
              totalesRentabilidad = {
                totalVenta: sumVenta,
                totalCosto: sumCosto,
                rentabilidadAcumulada: sumRent,
                margenPorcentual: margenPct,
                markup: markupGlobal
              };
              
              console.log('📊 Totales de rentabilidad calculados:');
              console.log(`   Venta: S/ ${sumVenta.toFixed(2)}`);
              console.log(`   Costo: S/ ${sumCosto.toFixed(2)}`);
              console.log(`   Rentabilidad: S/ ${sumRent.toFixed(2)}`);
              console.log(`   Margen: ${margenPct.toFixed(2)}%`);
              console.log(`   Markup: ${markupGlobal.toFixed(2)}`);
            }
          }
        }
        
        console.log('💰 Totales calculados en backend:');
        console.log(`   2024: S/ ${totalCalculado2024.toFixed(2)}`);
        console.log(`   2025: S/ ${totalCalculado2025.toFixed(2)}`);
        
        // Detectar el año de los datos para consultas de un solo año
        let añoDatos = null;
        let cantidadMeses = 0;
        let esMesUnico = false;
        
        if (dataForAI && dataForAI.data && dataForAI.data.length > 0) {
          añoDatos = dataForAI.data[0].Año || null;
          cantidadMeses = dataForAI.data.length;
          esMesUnico = cantidadMeses === 1;
        }
        
        console.log(`📊 Análisis de datos: ${cantidadMeses} mes(es) - ${esMesUnico ? 'MES ÚNICO' : 'MÚLTIPLES MESES'}`);
        
        // ✅ INTENTAR FORMATEO DIRECTO (sin OpenAI) para casos simples
        let analysisContent = null;
        
        // CASO 1: Mes único + consulta simple → Formateo directo
        if (esMesUnico && 
            tipoAnalisis !== 'analisis_comparativo' && 
            userIntent === 'ventas_ultimo_mes') {
          console.log('🎯 Usando formateo directo (sin OpenAI) para mes único simple');
          analysisContent = analizarYFormatearResultados(dataForAI.data, contextoTemporal, userIntent);
        } 
        // CASO 2: Múltiples meses + análisis comparativo → Formateo comparativo
        else if (!esMesUnico && tipoAnalisis === 'analisis_comparativo') {
          console.log('📊 Usando formateo comparativo (sin OpenAI) para múltiples meses');
          analysisContent = formatearAnalisisComparativo(dataForAI, contextoTemporal);
        }
        // CASO 3: Mes único pero análisis comparativo solicitado → OpenAI explica
        else if (esMesUnico && tipoAnalisis === 'analisis_comparativo') {
          console.log('⚠️ Mes único pero análisis comparativo solicitado - usando OpenAI');
        }
        
        // Si no hay formateo directo, usar OpenAI
        if (!analysisContent) {
          console.log('🤖 Usando OpenAI para análisis complejo');
        
          // Normalizar mensaje para detecciones posteriores
          const mensajeLower = (message || '').toLowerCase();
        
        // ✅ Extraer información del contexto para mencionar en el análisis
        const mensajeOriginal = message || ''; // Definir mensajeOriginal si no está definido
        // ✅ Usar sector validado completo (si existe) en lugar de extraerlo del mensaje
        const sectorTextoPrompt = validacionSectorGlobal?.sector || 
                                   mensajeOriginal.match(/sector\s+(?:1\.?\s*)?(.+?)(?:\s+\d+|$)/i)?.[1]?.trim() || 
                                   mensajeOriginal.match(/\b(minería|energía|construcción|retail|servicios)\b/i)?.[1]?.trim() || null;
        const esConsultaClientes = mensajeLower.includes('cliente') || mensajeLower.includes('clientes');
        const esConsultaRentabilidad = mensajeLower.includes('rentabilidad') || mensajeLower.includes('rentable');
        
        // Detectar si es consulta mensual o anual
        const esConsultaMensual = mensajeLower.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i);
        const esConsultaAnual = mensajeLower.match(/\b(2024|2025)\b/) && !esConsultaMensual;
        
        // ✅ EXTRAER TOP/BOTTOM Y TOTALES (VENTA, COSTO, RENTABILIDAD, MARGEN%) DEL DATASET REAL
        let topCliente = null;
        let bottomCliente = null;
        let hechosObligatorios = '';
        let totalesClientes = null;

        if (esConsultaClientes && esConsultaRentabilidad && dataForAI && dataForAI.data && dataForAI.data.length > 0) {
          console.log('🔍 Extrayendo Top y Bottom cliente del dataset real...');
          
          // Detectar columnas de rentabilidad y cliente (case-insensitive)
          const primeraFila = dataForAI.data[0];
          const columnas = Object.keys(primeraFila);
          const colRentabilidad = columnas.find(c => 
            c.toLowerCase() === 'rentabilidad' || 
            c.toLowerCase() === 'rentable'
          );
          const colCliente = columnas.find(c => 
            c.toLowerCase() === 'cliente' || 
            c.toLowerCase() === 'cliente_nombre'
          );
          const colVenta = columnas.find(c => c.toLowerCase() === 'totalventa' || c.toLowerCase() === 'venta' );
          const colCosto = columnas.find(c => c.toLowerCase() === 'totalcosto' || c.toLowerCase() === 'costo' );

          if (colRentabilidad && colCliente) {
            console.log(`✅ Columnas encontradas: Rentabilidad="${colRentabilidad}", Cliente="${colCliente}"`);
            
            // Filtrar filas válidas y ordenar por rentabilidad (descendente)
            const filasOrdenadas = dataForAI.data
              .map(r => ({
                Cliente: String(r[colCliente] || ''),
                Rentabilidad: parseFloat(r[colRentabilidad]) || 0
              }))
              .filter(r => r.Cliente) // Solo filas con cliente válido
              .sort((a, b) => b.Rentabilidad - a.Rentabilidad); // Mayor a menor

            if (filasOrdenadas.length > 0) {
              topCliente = filasOrdenadas[0]; // Mayor rentabilidad
              bottomCliente = filasOrdenadas[filasOrdenadas.length - 1]; // Menor rentabilidad
              
              console.log(`📊 Top cliente: ${topCliente.Cliente} (S/ ${topCliente.Rentabilidad.toFixed(2)})`);
              console.log(`📊 Bottom cliente: ${bottomCliente.Cliente} (S/ ${bottomCliente.Rentabilidad.toFixed(2)})`);
              
              // Calcular totales globales y márgen (%) basado en totales
              if (colVenta && colCosto) {
                let sumVenta = 0; let sumCosto = 0; let sumRent = 0;
                for (const r of dataForAI.data) {
                  sumVenta += parseFloat(r[colVenta]) || 0;
                  sumCosto += parseFloat(r[colCosto]) || 0;
                }
                sumRent = sumVenta - sumCosto;
                const margenPct = sumVenta > 0 ? ((sumRent / sumVenta) * 100) : 0;
                const markupGlobal = sumCosto > 0 ? (sumVenta / sumCosto) : 0;
                totalesClientes = { sumVenta, sumCosto, sumRent, margenPct, markupGlobal };
              }

              hechosObligatorios = `
⚠️ HECHOS OBLIGATORIOS - USA EXACTAMENTE ESTOS DATOS (NO los calcules ni asumas):
${topCliente ? `- **Cliente con MAYOR rentabilidad**: "${topCliente.Cliente}" con S/ ${topCliente.Rentabilidad.toFixed(2)}` : ''}
${bottomCliente && bottomCliente.Cliente !== topCliente?.Cliente ? `- **Cliente con MENOR rentabilidad**: "${bottomCliente.Cliente}" con S/ ${bottomCliente.Rentabilidad.toFixed(2)}` : ''}
${totalesClientes ? `- **Totales del conjunto**: Venta S/ ${totalesClientes.sumVenta.toFixed(2)}, Costo S/ ${totalesClientes.sumCosto.toFixed(2)}, Rentabilidad S/ ${totalesClientes.sumRent.toFixed(2)}
- **Margen global**: ${totalesClientes.margenPct.toFixed(2)}%  |  **Markup global**: ${totalesClientes.markupGlobal.toFixed(2)}` : ''}

🚫 CRÍTICO: Estos son los datos EXACTOS del dataset ordenado. El cliente "${topCliente?.Cliente}" es el PRIMERO en rentabilidad. NO uses otro cliente como "mayor rentabilidad" ni inventes números.
`;
            } else {
              console.log('⚠️ No se encontraron filas válidas con cliente y rentabilidad');
            }
          } else {
            console.log(`⚠️ No se encontraron columnas: Rentabilidad=${!!colRentabilidad}, Cliente=${!!colCliente}`);
            console.log(`   Columnas disponibles: ${columnas.join(', ')}`);
          }
        }
        
        // Calcular mejor/peor mes y promedio mensual directamente desde dataForAI (si hay datos mensuales)
        let infoMejorPeorMes = '';
        let promedioMensualCalculado = 0;
        let tieneDatosMensualesCalculado = false;
        
        if (!esConsultaClientes && dataForAI && dataForAI.data && dataForAI.data.length > 0) {
          // Detectar métrica principal
          const primeraFila = dataForAI.data[0];
          const colMetrica = primeraFila.Rentabilidad !== undefined ? 'Rentabilidad' : 
                            (primeraFila.TotalVenta !== undefined ? 'TotalVenta' : 
                            (primeraFila.Ventas !== undefined ? 'Ventas' : null));
          
          // Si tiene columnas Mes o Año, es dato mensual
          if (colMetrica && (primeraFila.Mes !== undefined || primeraFila.Año !== undefined)) {
            tieneDatosMensualesCalculado = true;
            const datosOrdenados = [...dataForAI.data].sort((a, b) => 
              (b[colMetrica] || 0) - (a[colMetrica] || 0)
            );
            
            // Contar meses únicos
            const mesesUnicos = new Set();
            dataForAI.data.forEach(r => {
              if (r.Mes) mesesUnicos.add(r.Mes);
            });
            
            // Calcular promedio mensual
            const totalMetrica = dataForAI.data.reduce((sum, r) => sum + (r[colMetrica] || 0), 0);
            promedioMensualCalculado = mesesUnicos.size > 0 ? totalMetrica / mesesUnicos.size : totalMetrica / dataForAI.data.length;
            
            if (datosOrdenados.length > 0) {
              const mejor = datosOrdenados[0];
              const peor = datosOrdenados[datosOrdenados.length - 1];
              
              infoMejorPeorMes = `
📅 MEJOR Y PEOR MES DEL SECTOR${sectorTextoPrompt ? ` ${sectorTextoPrompt.toUpperCase()}` : ''}:
- **Mejor Mes**: ${mejor.Mes || mejor.NombreMes || '—'} ${mejor.Año || ''} con rentabilidad de S/ ${(mejor[colMetrica] || 0).toFixed(2)}
- **Peor Mes**: ${peor.Mes || peor.NombreMes || '—'} ${peor.Año || ''} con rentabilidad de S/ ${(peor[colMetrica] || 0).toFixed(2)}

⚠️ CRÍTICO: DEBES mencionar el NOMBRE COMPLETO del mes (ej: "Septiembre", "Octubre") junto con el monto en la sección de Métricas Clave.
`;
            }
          }
        }
        
        let infoCrecimiento = '';
        if (esConsultaRentabilidad) {
          if (esConsultaMensual) {
            infoCrecimiento = `
📈 CRECIMIENTO: Esta consulta es mensual. Si hay datos del mes anterior del mismo sector, calcula el crecimiento comparando con ese mes anterior. Si no hay datos del mes anterior, indica "No hay datos comparables" o "—".
`;
          } else if (esConsultaAnual) {
            const añoMencionado = mensajeOriginal.match(/\b(2024|2025)\b/)?.[1];
            const añoAnterior = añoMencionado ? parseInt(añoMencionado) - 1 : null;
            infoCrecimiento = `
📈 CRECIMIENTO: Esta consulta es anual (${añoMencionado || 'año actual'}). Si hay datos de ${añoAnterior || 'año anterior'} del mismo sector, calcula el crecimiento comparando año vs año. Si no hay datos del año anterior, indica "No hay datos comparables" o "—".
`;
          } else {
            infoCrecimiento = `
📈 CRECIMIENTO: Calcula el crecimiento comparando el periodo actual con el periodo anterior del mismo sector. Si no hay datos del periodo anterior, indica "No hay datos comparables" o "—".
`;
          }
        }
        
        const contextoAdicional = `
${sectorTextoPrompt ? `⚠️ CRÍTICO - TODAS LAS MÉTRICAS SON DEL SECTOR: Esta consulta es específicamente sobre el SECTOR "${sectorTextoPrompt.toUpperCase()}". 
🚫 TODAS las métricas que menciones (Total Ventas, Rentabilidad Acumulada, Promedio Mensual, Mejor/Peor Cliente, Mejor/Peor Mes, Crecimiento) DEBEN ser del sector ${sectorTextoPrompt.toUpperCase()} únicamente. No menciones datos de otros sectores.` : ''}
${validacionSectorGlobal?.sector && !sectorTextoPrompt ? `⚠️ IMPORTANTE: Esta consulta es sobre el sector "${validacionSectorGlobal.sector}". DEBES mencionar el nombre completo del sector en tu análisis.` : ''}
${esConsultaClientes && esConsultaRentabilidad ? `⚠️ IMPORTANTE: Esta consulta es sobre CLIENTES con rentabilidad${sectorTextoPrompt ? ` del sector ${sectorTextoPrompt.toUpperCase()}` : ''}. Los datos muestran CLIENTES, no periodos temporales. Menciona "clientes" en tu análisis.
⚠️ CRÍTICO: La rentabilidad incluye valores POSITIVOS Y NEGATIVOS. NO asumas que solo hay rentabilidad positiva. Los clientes con menor rentabilidad pueden tener rentabilidad NEGATIVA (pérdidas), y eso es parte del análisis.` : ''}
${infoMejorPeorMes}
${infoCrecimiento}
${hechosObligatorios}
`;

        const analysisPrompt = `Analiza estos datos${esConsultaClientes && esConsultaRentabilidad ? ' de clientes con rentabilidad' : ' de ventas'} y proporciona un informe ejecutivo COMPLETO.

DATOS:
${JSON.stringify(dataForAI, null, 2)}

${totalCalculado2024 > 0 || totalCalculado2025 > 0 ? `
TOTALES EXACTOS (USA ESTOS NÚMEROS):
- Total 2024: S/ ${totalCalculado2024.toFixed(2)}
- Total 2025: S/ ${totalCalculado2025.toFixed(2)}

⚠️ IMPORTANTE: USA EXACTAMENTE ESTOS TOTALES. NO los calcules tú mismo.
` : ''}

${totalesRentabilidad ? `
📊 TOTALES DE RENTABILIDAD ACUMULADOS DEL SECTOR${sectorTextoPrompt ? ` ${sectorTextoPrompt.toUpperCase()}` : ''} (OBLIGATORIO MENCIONAR EN MÉTRICAS CLAVE):
- **Total Ventas**: S/ ${totalesRentabilidad.totalVenta.toFixed(2)}${sectorTextoPrompt ? ` (del sector ${sectorTextoPrompt.toUpperCase()})` : ''}
- **Total Costos**: S/ ${totalesRentabilidad.totalCosto.toFixed(2)}${sectorTextoPrompt ? ` (del sector ${sectorTextoPrompt.toUpperCase()})` : ''}
- **Rentabilidad Acumulada**: S/ ${totalesRentabilidad.rentabilidadAcumulada.toFixed(2)}${sectorTextoPrompt ? ` (del sector ${sectorTextoPrompt.toUpperCase()} en ${añoDatos || 'el periodo consultado'})` : ''}
- **Margen**: ${totalesRentabilidad.margenPorcentual.toFixed(2)}%
- **Markup**: ${totalesRentabilidad.markup.toFixed(2)}
${tieneDatosMensualesCalculado && promedioMensualCalculado > 0 ? `
- **Promedio Mensual de Rentabilidad**: S/ ${promedioMensualCalculado.toFixed(2)}${sectorTextoPrompt ? ` (del sector ${sectorTextoPrompt.toUpperCase()})` : ''}` : ''}

🚫 CRÍTICO: DEBES incluir TODAS estas métricas en la sección "Métricas Clave" del informe, especificando claramente que son del sector consultado.
` : ''}

${añoDatos ? `
AÑO DE LOS DATOS: ${añoDatos}
CANTIDAD DE MESES CON DATOS: ${cantidadMeses}
${esMesUnico ? `
⚠️ CRÍTICO: SOLO HAY UN MES DE DATOS. 
NO menciones "mejor mes" ni "peor mes" porque no hay comparación posible.
Usa el formato de "MES ÚNICO" especificado en las reglas.
` : ''}
` : ''}

CONSULTA ORIGINAL: "${message}"
${contextoAdicional}

FORMATO REQUERIDO:

# 📊 [Título del Análisis]

## 📈 Métricas Clave
${esConsultaRentabilidad ? `
- **Total Ventas**: S/ [monto] (USA el valor exacto proporcionado arriba)${sectorTextoPrompt ? ` - Sector ${sectorTextoPrompt.toUpperCase()}` : ''}
- **Rentabilidad Acumulada**: S/ [monto] (USA el valor exacto proporcionado arriba - OBLIGATORIO)${sectorTextoPrompt ? ` - Sector ${sectorTextoPrompt.toUpperCase()}` : ''}
- **Margen**: [porcentaje]% (USA el valor exacto proporcionado arriba)
${tieneDatosMensualesCalculado ? `- **Promedio Mensual de Rentabilidad**: S/ [monto] (USA el valor exacto proporcionado arriba)${sectorTextoPrompt ? ` - Sector ${sectorTextoPrompt.toUpperCase()}` : ''}` : ''}
${esConsultaClientes ? `
- **Mejor Cliente**: [nombre] (S/ [monto])${sectorTextoPrompt ? ` - Sector ${sectorTextoPrompt.toUpperCase()}` : ''}
- **Cliente con Menor Rentabilidad**: [nombre] (S/ [monto])${sectorTextoPrompt ? ` - Sector ${sectorTextoPrompt.toUpperCase()}` : ''}
` : `
${infoMejorPeorMes ? `- **Mejor Mes**: [nombre del mes completo] [año] (S/ [monto]) - USA los datos proporcionados arriba
- **Peor Mes**: [nombre del mes completo] [año] (S/ [monto]) - USA los datos proporcionados arriba` : `- **Mejor Mes**: [mes completo] (S/ [monto]) (si aplica)
- **Mes Bajo**: [mes completo] (S/ [monto]) (si aplica)`}
`}
` : `
- **Total Ventas**: S/ [monto]
- **Promedio Mensual**: S/ [monto]
- **Mejor Mes**: [mes] (S/ [monto])
- **Mes Bajo**: [mes] (S/ [monto])
`}

## 📅 Análisis por Periodo
[Análisis detallado de tendencias, patrones, y cambios significativos]

## 🎯 Conclusiones
- [Conclusión 1]
- [Conclusión 2]
- [Conclusión 3]

IMPORTANTE:
- NO menciones visualizaciones (el frontend las genera automáticamente)
- USA los totales exactos que te proporcioné arriba
- Sé específico con los números y porcentajes
- Enfócate en insights ejecutivos

## 🎯 REGLAS DE INTERPRETACIÓN DE RESULTADOS

**NUNCA digas que un mes es "el mejor" y "el peor" simultáneamente.**

Si solo hay datos de UN mes:
❌ INCORRECTO: "Mejor Mes: Septiembre. Peor Mes: Septiembre"
✅ CORRECTO: "Análisis de Septiembre 2025 (único mes con datos disponibles)"

Si hay datos de múltiples meses:
✅ Solo entonces mencionar "mejor mes" y "peor mes"

Formato para MES ÚNICO:
\`\`\`
📊 ANÁLISIS DE SEPTIEMBRE 2025

💰 Total Ventas: S/ 5,347,091.61
📊 Transacciones: 5,461
📈 Promedio: S/ 979.14 por transacción

ℹ️ NOTA: Solo hay datos disponibles para septiembre 2025 en el sistema.
Para identificar tendencias, se necesitan datos de múltiples meses.
\`\`\`

Formato para MÚLTIPLES MESES:
\`\`\`
📊 ANÁLISIS DE VENTAS 2025 (3 meses)

Total Anual: S/ 15.2M

📈 Mejor Mes: Septiembre (S/ 5.3M)
📉 Mes Más Bajo: Julio (S/ 3.1M)
📊 Promedio Mensual: S/ 5.1M
\`\`\``;

        // Para análisis, usamos temperature ligeramente más alta para creatividad
        const analysisResponse = await openaiService.chat(analysisPrompt, [], {
          temperature: 0.3,
          model: 'gpt-4-turbo-preview',
          toolsEnabled: false
        });
        
        console.log('🌡️ Temperature para análisis: 0.3 (balance entre consistencia y creatividad)');
        
        // Usar el contenido de OpenAI
        analysisContent = analysisResponse.content;
        
        } // Fin del if (!analysisContent)
        
        // Retornar respuesta procesada CON LOS DATOS REALES
        const dataPreview = dataForAI;
        
        // LOG CRÍTICO: Ver qué datos se envían al frontend
        console.log('🚀 DATOS QUE SE ENVÍAN AL FRONTEND:');
        console.log('📊 dataPreview:', JSON.stringify(dataPreview, null, 2));
        if (dataPreview && dataPreview.data) {
          console.log('📋 Total de registros:', dataPreview.data.length);
          console.log('🔍 Primer registro:', dataPreview.data[0]);
          console.log('🔍 Último registro:', dataPreview.data[dataPreview.data.length - 1]);
          
          // Verificar si tiene columna "Año"
          if (dataPreview.data[0].Año !== undefined) {
            console.log('✅ Los datos TIENEN columna Año');
            const años = [...new Set(dataPreview.data.map(d => d.Año))];
            console.log('📅 Años encontrados:', años);
          } else {
            console.log('❌ Los datos NO TIENEN columna Año');
          }
        }
        
        // ============================================
        // 📊 RESUMEN DE LA CONSULTA
        // ============================================
        console.log('\n' + '='.repeat(80));
        console.log('✅ CONSULTA PROCESADA EXITOSAMENTE');
        console.log('='.repeat(80));
        // Determinar estrategia de formateo usada
        const estrategiaFormateo = esMesUnico && tipoAnalisis !== 'analisis_comparativo' 
          ? 'FORMATEO_DIRECTO_SIMPLE'
          : !esMesUnico && tipoAnalisis === 'analisis_comparativo'
          ? 'FORMATEO_COMPARATIVO'
          : 'OPENAI_ANALISIS';
        
        console.log('🎯 Intención:', userIntent);
        console.log('📊 Tipo de análisis:', tipoAnalisis);
        console.log('📅 Periodo:', `${contextoTemporal.nombre_mes_anterior} ${contextoTemporal.año_mes_anterior}`);
        console.log('⚡ Estrategia SQL:', usandoTemplate ? 'CACHÉ/TEMPLATE (RÁPIDO)' : 'OPENAI (INTELIGENTE)');
        console.log('🎨 Estrategia Formateo:', estrategiaFormateo);
        console.log('📊 Total registros:', dataPreview?.data?.length || 0);
        console.log('💾 Caché actual:', getCacheStats());
        console.log('='.repeat(80) + '\n');
        
        // ✅ CALCULAR CRECIMIENTO vs PERIODO ANTERIOR del mismo sector
        let crecimientoCalculado = null;
        let tieneComparacion = false;
        
        // ✅ USAR SECTOR VALIDADO GLOBALMENTE (ya validado antes con detectarSectorExacto)
        let sectorSQLFilter = validacionSectorGlobal?.filtroSQL || null;
        
        if (dataPreview && dataPreview.data && dataPreview.data.length > 0) {
          const mensajeLowerCrec = message.toLowerCase();
          const esConsultaRentabilidad = mensajeLowerCrec.includes('rentabilidad') || mensajeLowerCrec.includes('rentable');
          
          if (esConsultaRentabilidad && sectorSQLFilter) {
            console.log(`🔍 Usando sector validado para crecimiento: "${validacionSectorGlobal?.sector || 'N/A'}" (filtro SQL: "${sectorSQLFilter}")`);
            
            // Detectar si es anual o mensual
            const añoMencionado = message.match(/\b(2024|2025)\b/)?.[1];
            const mesMencionado = mensajeLowerCrec.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i);
            
            // Calcular total del periodo actual
            const primeraFila = dataPreview.data[0];
            let totalActual = 0;
            
            // Si hay columna Rentabilidad directamente, usarla
            if (primeraFila.Rentabilidad !== undefined) {
              totalActual = dataPreview.data.reduce((sum, r) => sum + (parseFloat(r.Rentabilidad) || 0), 0);
            } 
            // Si hay TotalVenta y TotalCosto, calcular Rentabilidad
            else if (primeraFila.TotalVenta !== undefined && primeraFila.TotalCosto !== undefined) {
              const totalVenta = dataPreview.data.reduce((sum, r) => sum + (parseFloat(r.TotalVenta) || 0), 0);
              const totalCosto = dataPreview.data.reduce((sum, r) => sum + (parseFloat(r.TotalCosto) || 0), 0);
              totalActual = totalVenta - totalCosto;
            }
            // Si solo hay Ventas (sin Costo), usar Ventas como métrica
            else if (primeraFila.Ventas !== undefined || primeraFila.TotalVenta !== undefined) {
              const colMetrica = primeraFila.Ventas !== undefined ? 'Ventas' : 'TotalVenta';
              totalActual = dataPreview.data.reduce((sum, r) => sum + (parseFloat(r[colMetrica]) || 0), 0);
            }
            
            if (totalActual > 0 || primeraFila.Rentabilidad !== undefined || (primeraFila.TotalVenta !== undefined && primeraFila.TotalCosto !== undefined)) {
              
              // Construir SQL para periodo anterior
              let sqlPeriodoAnterior = null;
              let periodoAnteriorTexto = '';
              
              if (añoMencionado && !mesMencionado && sectorSQLFilter) {
                // Consulta anual: comparar con año anterior
                const añoAnterior = parseInt(añoMencionado) - 1;
                periodoAnteriorTexto = `${añoAnterior}`;
                
                sqlPeriodoAnterior = `SELECT SUM(tac.Venta - tac.Costo) as Rentabilidad
                  FROM Tmp_AnalisisComercial_prueba tac
                  ${primeraFila.Cliente !== undefined ? 'INNER JOIN temporal_cliente tc ON tac.[Codigo Cliente] = tc.[Codigo Cliente]' : ''}
                  WHERE YEAR(tac.fecha) = ${añoAnterior}
                  AND tac.SECTOR LIKE '${sectorSQLFilter}'`;
                  
                console.log(`📝 SQL periodo anterior (anual): ${sqlPeriodoAnterior.substring(0, 150)}...`);
              } else if (mesMencionado && añoMencionado && sectorSQLFilter) {
                // Consulta mensual: comparar con mes anterior
                const mesIndex = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                                 'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre']
                                .indexOf(mesMencionado[0].toLowerCase());
                
                if (mesIndex >= 0) {
                  let mesAnterior = mesIndex; // 0-11
                  let añoAnterior = parseInt(añoMencionado);
                  
                  if (mesAnterior === 0) {
                    mesAnterior = 12;
                    añoAnterior -= 1;
                  } else {
                    mesAnterior -= 1;
                  }
                  
                  periodoAnteriorTexto = `${añoAnterior}-${mesAnterior + 1}`;
                  
                  sqlPeriodoAnterior = `SELECT SUM(tac.Venta - tac.Costo) as Rentabilidad
                    FROM Tmp_AnalisisComercial_prueba tac
                    ${primeraFila.Cliente !== undefined ? 'INNER JOIN temporal_cliente tc ON tac.[Codigo Cliente] = tc.[Codigo Cliente]' : ''}
                    WHERE YEAR(tac.fecha) = ${añoAnterior}
                    AND MONTH(tac.fecha) = ${mesAnterior + 1}
                    AND tac.SECTOR LIKE '${sectorSQLFilter}'`;
                    
                  console.log(`📝 SQL periodo anterior (mensual): ${sqlPeriodoAnterior.substring(0, 150)}...`);
                }
              } else {
                console.log(`⚠️ No se puede construir SQL de periodo anterior: sectorSQLFilter=${!!sectorSQLFilter}, año=${añoMencionado}, mes=${mesMencionado?.[0]}`);
              }
              
              // Ejecutar consulta del periodo anterior si existe
              if (sqlPeriodoAnterior && mcpClient) {
                try {
                  console.log(`📊 Calculando crecimiento: consultando periodo anterior (${periodoAnteriorTexto})...`);
                  const resultadoAnterior = await mcpClient.callTool('execute_query', { query: sqlPeriodoAnterior });
                  
                  if (resultadoAnterior && resultadoAnterior.content && resultadoAnterior.content[0]) {
                    try {
                      // El formato del MCP es: { content: [{ type: 'text', text: '{"rowCount": 1, "data": [...]}' }] }
                      const dataAnterior = JSON.parse(resultadoAnterior.content[0].text);
                      const totalAnterior = parseFloat(dataAnterior?.data?.[0]?.Rentabilidad || 0);
                      
                      console.log(`📊 Datos periodo anterior (${periodoAnteriorTexto}):`, {
                        totalAnterior,
                        estructura: Object.keys(dataAnterior),
                        primeraFila: dataAnterior?.data?.[0]
                      });
                      
                      if (totalAnterior !== 0 && !isNaN(totalAnterior)) {
                        crecimientoCalculado = ((totalActual - totalAnterior) / totalAnterior) * 100;
                        tieneComparacion = true;
                        console.log(`✅ Crecimiento calculado: ${crecimientoCalculado.toFixed(2)}% (Actual: S/ ${totalActual.toFixed(2)}, Anterior: S/ ${totalAnterior.toFixed(2)})`);
                      } else {
                        console.log(`⚠️ Periodo anterior tiene valor ${totalAnterior}, no se puede calcular crecimiento`);
                      }
                    } catch (errorParse) {
                      console.warn('⚠️ Error parseando resultado del periodo anterior:', errorParse.message);
                      console.warn('   Resultado recibido:', JSON.stringify(resultadoAnterior).substring(0, 200));
                    }
                  }
                } catch (errorCre) {
                  console.warn('⚠️ No se pudo calcular crecimiento vs periodo anterior:', errorCre.message);
                }
              }
            }
          }
        }
        
        // Construir metadata de visualización para el frontend
        let metadataVisualizacion = null;
        try {
          metadataVisualizacion = construirMetadataVisualizacion(
          dataPreview,
          tipoAnalisis,
            contextoTemporal,
            message,  // ✅ NUEVO: Incluir mensaje original para detectar periodo
            validacionSectorGlobal  // ✅ NUEVO: Pasar sector validado completo para títulos
        );
          
          // Incluir crecimiento calculado y margen en los datos de gráficos
          // ✅ PRESERVAR meses si ya existe (no sobrescribir)
          if (!metadataVisualizacion.datos_para_graficos) {
            metadataVisualizacion.datos_para_graficos = {};
          } else {
            // Preservar meses si ya existe
            const mesesExistentes = metadataVisualizacion.datos_para_graficos.meses;
            console.log('🔍 Preservando meses existentes:', {
              tiene_meses: !!mesesExistentes,
              cantidad: mesesExistentes?.length,
              primer_mes: mesesExistentes?.[0]
            });
          }
          if (crecimientoCalculado !== null) {
            metadataVisualizacion.datos_para_graficos.crecimiento_periodo_anterior = crecimientoCalculado;
            metadataVisualizacion.datos_para_graficos.tiene_comparacion = tieneComparacion;
            console.log(`✅ Crecimiento incluido en metadata: ${crecimientoCalculado.toFixed(2)}% (tiene_comparacion: ${tieneComparacion})`);
          } else {
            console.log('⚠️ No se calculó crecimiento (crecimientoCalculado es null)');
          }
          
          // Incluir valores de rentabilidad si están disponibles
          if (totalesRentabilidad) {
            if (totalesRentabilidad.margenPorcentual !== undefined) {
              metadataVisualizacion.datos_para_graficos.margen_porcentual = totalesRentabilidad.margenPorcentual;
              console.log(`✅ Margen incluido en metadata: ${totalesRentabilidad.margenPorcentual.toFixed(2)}%`);
            }
            
            // ✅ IMPORTANTE: Incluir rentabilidad acumulada y total venta si existen
            // Estos valores reemplazan los calculados por construirMetadataVisualizacion
            // porque son los valores REALES calculados desde todos los datos
            if (totalesRentabilidad.rentabilidadAcumulada !== undefined) {
              metadataVisualizacion.datos_para_graficos.total_acumulado = totalesRentabilidad.rentabilidadAcumulada;
              console.log(`✅ Rentabilidad acumulada incluida en total_acumulado: S/ ${totalesRentabilidad.rentabilidadAcumulada.toFixed(2)}`);
            }
            
            if (totalesRentabilidad.totalVenta !== undefined) {
              // Guardar total de ventas en un campo separado también
              metadataVisualizacion.datos_para_graficos.total_ventas_real = totalesRentabilidad.totalVenta;
              console.log(`✅ Total ventas incluido: S/ ${totalesRentabilidad.totalVenta.toFixed(2)}`);
            }
            
            // Calcular y actualizar promedio mensual basado en rentabilidad acumulada
            // si tenemos meses únicos disponibles
            if (metadataVisualizacion.datos_para_graficos.cantidad_meses_unicos > 0) {
              const promedioCalculado = totalesRentabilidad.rentabilidadAcumulada / metadataVisualizacion.datos_para_graficos.cantidad_meses_unicos;
              metadataVisualizacion.datos_para_graficos.promedio_mensual = promedioCalculado;
              console.log(`✅ Promedio mensual actualizado: S/ ${promedioCalculado.toFixed(2)} (${totalesRentabilidad.rentabilidadAcumulada.toFixed(2)} / ${metadataVisualizacion.datos_para_graficos.cantidad_meses_unicos} meses)`);
            } else if (dataPreview && dataPreview.data && dataPreview.data.length > 0) {
              // Si no hay meses únicos, calcular promedio por cantidad de registros (clientes)
              const promedioPorRegistro = totalesRentabilidad.rentabilidadAcumulada / dataPreview.data.length;
              metadataVisualizacion.datos_para_graficos.promedio_mensual = promedioPorRegistro;
              console.log(`✅ Promedio por registro actualizado: S/ ${promedioPorRegistro.toFixed(2)} (${totalesRentabilidad.rentabilidadAcumulada.toFixed(2)} / ${dataPreview.data.length} registros)`);
            }
          }
          
          // ✅ CALCULAR MEJOR MES DEL PERIODO cuando es consulta anual de clientes con rentabilidad
          if (dataPreview && dataPreview.data && dataPreview.data.length > 0) {
            const primeraFilaPreview = dataPreview.data[0];
            const esConsultaClientes = primeraFilaPreview.Cliente !== undefined && 
                                      primeraFilaPreview.Mes === undefined &&
                                      primeraFilaPreview.Año === undefined;
            const mensajeLowerMejorMes = message.toLowerCase();
            const esConsultaRentabilidadMejorMes = mensajeLowerMejorMes.includes('rentabilidad') || mensajeLowerMejorMes.includes('rentable');
            const añoMencionadoMejorMes = message.match(/\b(2024|2025)\b/)?.[1];
            
            if (esConsultaClientes && esConsultaRentabilidadMejorMes && añoMencionadoMejorMes && sectorSQLFilter) {
              try {
                console.log(`📅 Calculando mejor mes del periodo ${añoMencionadoMejorMes} (sector: ${sectorSQLFilter})...`);
                
                // SQL para obtener rentabilidad mensual del sector y año
                const sqlMejorMes = `SELECT 
                  MONTH(tac.fecha) as Mes,
                  YEAR(tac.fecha) as Año,
                  DATENAME(MONTH, tac.fecha) as NombreMes,
                  SUM(tac.Venta - tac.Costo) as Rentabilidad
                FROM Tmp_AnalisisComercial_prueba tac
                WHERE YEAR(tac.fecha) = ${añoMencionadoMejorMes}
                AND tac.SECTOR LIKE '${sectorSQLFilter}'
                GROUP BY MONTH(tac.fecha), YEAR(tac.fecha), DATENAME(MONTH, tac.fecha)
                ORDER BY SUM(tac.Venta - tac.Costo) DESC`;
                
                const resultadoMejorMes = await mcpClient.callTool('execute_query', { query: sqlMejorMes });
                
                if (resultadoMejorMes && resultadoMejorMes.content && resultadoMejorMes.content[0]) {
                  const dataMejorMes = JSON.parse(resultadoMejorMes.content[0].text);
                  
                  if (dataMejorMes && dataMejorMes.data && dataMejorMes.data.length > 0) {
                    const mejorMesData = dataMejorMes.data[0]; // Ya está ordenado DESC
                    
                    // Mapear número de mes a nombre
                    const nombresMeses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                                         'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                    
                    metadataVisualizacion.datos_para_graficos.mejor_mes_periodo = {
                      mes: mejorMesData.NombreMes || nombresMeses[mejorMesData.Mes] || `Mes ${mejorMesData.Mes}`,
                      numero_mes: mejorMesData.Mes,
                      año: mejorMesData.Año,
                      rentabilidad: mejorMesData.Rentabilidad || 0
                    };
                    
                    console.log(`✅ Mejor mes del periodo ${añoMencionadoMejorMes}: ${metadataVisualizacion.datos_para_graficos.mejor_mes_periodo.mes} con S/ ${metadataVisualizacion.datos_para_graficos.mejor_mes_periodo.rentabilidad.toFixed(2)}`);
                  }
                }
              } catch (errorMejorMes) {
                console.warn('⚠️ No se pudo calcular mejor mes del periodo:', errorMejorMes.message);
              }
            }
            
            // ✅ ASEGURAR que para consultas de clientes SIEMPRE tengamos datos para gráficos
            // Esto es crítico: sin estos datos, no se generan los gráficos
            if (esConsultaClientes && esConsultaRentabilidadMejorMes) {
              // Primero: asegurar que tenemos datos base de clientes en meses
              if (!metadataVisualizacion.datos_para_graficos.meses || 
                  metadataVisualizacion.datos_para_graficos.meses.length === 0) {
                console.log(`📊 Preparando datos de clientes para gráficos (año ${añoMencionadoMejorMes || 'no especificado'})...`);
                
                const clientesParaGraficos = dataPreview.data
                  .map(cliente => ({
                    mes: cliente.Cliente, // El frontend usa "mes" para el label
                    año: añoMencionadoMejorMes || new Date().getFullYear(),
                    total: parseFloat(cliente.Rentabilidad) || 0,
                    transacciones: cliente.NumOperaciones || 1,
                    promedio: parseFloat(cliente.TotalVenta) || 0,
                    margen_actual: parseFloat(cliente.MargenPct) || 0
                  }))
                  .sort((a, b) => b.total - a.total); // Mayor a menor rentabilidad
                
                if (!metadataVisualizacion.datos_para_graficos) {
                  metadataVisualizacion.datos_para_graficos = {};
                }
                metadataVisualizacion.datos_para_graficos.meses = clientesParaGraficos;
                
                console.log(`✅ ${clientesParaGraficos.length} clientes preparados para gráficos`);
              }
            }
            
          // ✅ Fallback comparativo año vs año (p.ej., "ventas 2024 vs 2025")
          // Si el análisis es comparativo y no tenemos datos para gráficos,
          // agregamos un dataset simple por AÑO para que el frontend dibuje 2 barras
          try {
            const añosEnMensaje = (message.match(/\b(202[0-9])\b/g) || []).map(a => parseInt(a, 10));
            const añosUnicos = Array.from(new Set(añosEnMensaje));
            // Preparar comparativo simple si es análisis comparativo y hay al menos 2 años en el mensaje.
            // Lo aplicamos si no hay meses, o si hay menos de 2 puntos, o si los labels no parecen ser años.
            const labelsActuales = (metadataVisualizacion.datos_para_graficos.meses || []).map(x => String(x.mes || ''));
            const labelsParecenAnios = labelsActuales.every(l => /^\d{4}$/.test(l));
            const tienePatronVsAnios = /\b20\d{2}\s*vs\s*20\d{2}\b/i.test(message);
            const necesitaComparativoSimple = (tipoAnalisis === 'analisis_comparativo' || tienePatronVsAnios)
              && añosUnicos.length >= 2
              && (
                !metadataVisualizacion.datos_para_graficos.meses ||
                metadataVisualizacion.datos_para_graficos.meses.length < 2 ||
                !labelsParecenAnios
              );

            if (necesitaComparativoSimple) {
              const y1 = añosUnicos[0];
              const y2 = añosUnicos[1];
              console.log(`📊 Preparando comparativo simple por año: ${y1} vs ${y2}`);

              const sqlComparativoAnios = `SELECT 
                YEAR(tac.fecha) as Año,
                SUM(tac.Venta) as Ventas
              FROM Tmp_AnalisisComercial_prueba tac
              ${sectorSQLFilter ? `WHERE tac.SECTOR LIKE '${sectorSQLFilter}' AND YEAR(tac.fecha) IN (${y1}, ${y2})` : `WHERE YEAR(tac.fecha) IN (${y1}, ${y2})`}
              GROUP BY YEAR(tac.fecha)
              ORDER BY YEAR(tac.fecha)`;

              const resultadoComparativo = await mcpClient.callTool('execute_query', { query: sqlComparativoAnios });
              if (resultadoComparativo && resultadoComparativo.content && resultadoComparativo.content[0]) {
                const dataComp = JSON.parse(resultadoComparativo.content[0].text);
                if (dataComp && dataComp.data) {
                  const mesesComparativo = dataComp.data.map(r => ({
                    mes: String(r.Año),
                    año: r.Año,
                    total: parseFloat(r.Ventas) || 0,
                    transacciones: 1,
                    promedio: parseFloat(r.Ventas) || 0
                  }));

                  if (!metadataVisualizacion.datos_para_graficos) {
                    metadataVisualizacion.datos_para_graficos = {};
                  }
                  metadataVisualizacion.datos_para_graficos.meses = mesesComparativo;

                  // Totales básicos para KPI
                  const totalComp = mesesComparativo.reduce((acc, x) => acc + (x.total || 0), 0);
                  metadataVisualizacion.datos_para_graficos.total_acumulado = totalComp;
                  metadataVisualizacion.datos_para_graficos.promedio_mensual = totalComp / mesesComparativo.length;
                  metadataVisualizacion.visualizaciones_recomendadas = {
                    ...(metadataVisualizacion.visualizaciones_recomendadas || {}),
                    mostrar_grafico_barras: true,
                    mostrar_tendencia_temporal: false
                  };

                  console.log(`✅ Comparativo simple por año preparado (${mesesComparativo.length} barras)`);
                }
              }
            }
          } catch (errorComp) {
            console.warn('⚠️ No se pudo preparar comparativo simple por año:', errorComp.message);
          }

          // ✅ COMPARATIVO MENSUAL DETALLADO (YYYY vs YYYY) si hay patrón de años
          try {
            const years = (message.match(/\b(202[0-9])\b/g) || []).map(a => parseInt(a, 10));
            const uniqueYears = Array.from(new Set(years)).slice(0, 2).sort();
            if (uniqueYears.length === 2) {
              const y1 = uniqueYears[0];
              const y2 = uniqueYears[1];
              const sqlMensual = `
                SELECT d.MesNum, d.MesNombre,
                       MAX(CASE WHEN d.Anio = ${y1} THEN d.Ventas END) AS Ventas_${y1},
                       MAX(CASE WHEN d.Anio = ${y2} THEN d.Ventas END) AS Ventas_${y2}
                FROM (
                  SELECT YEAR(tac.fecha) AS Anio,
                         DATENAME(MONTH, tac.fecha) AS MesNombre,
                         MONTH(tac.fecha) AS MesNum,
                         SUM(tac.Venta) AS Ventas
                  FROM Tmp_AnalisisComercial_prueba tac
                  WHERE YEAR(tac.fecha) IN (${y1}, ${y2})
                  ${sectorSQLFilter ? `AND tac.SECTOR LIKE '${sectorSQLFilter}'` : ''}
                  GROUP BY YEAR(tac.fecha), DATENAME(MONTH, tac.fecha), MONTH(tac.fecha)
                ) d
                GROUP BY d.MesNum, d.MesNombre
                ORDER BY d.MesNum`;

              const rMensual = await mcpClient.callTool('execute_query', { query: sqlMensual });
              if (rMensual && rMensual.content && rMensual.content[0]) {
                const dataMensual = JSON.parse(rMensual.content[0].text).data || [];
                const comparativo = dataMensual.map(r => {
                  const v1 = parseFloat(r[`Ventas_${y1}`] || 0);
                  const v2 = parseFloat(r[`Ventas_${y2}`] || 0);
                  const delta = v1 ? ((v2 - v1) / v1) * 100 : (v2 > 0 ? 100 : 0);
                  return { mes_num: r.MesNum, mes_nombre: r.MesNombre, y1: v1, y2: v2, delta_pct: isFinite(delta) ? delta : 0 };
                });
                if (!metadataVisualizacion.datos_para_graficos) {
                  metadataVisualizacion.datos_para_graficos = {};
                }
                metadataVisualizacion.datos_para_graficos.comparativo_mensual = {
                  anio_base: y1,
                  anio_comp: y2,
                  filas: comparativo
                };
              }

              // Totales por año para el texto/KPI
              const sqlTotales = `
                SELECT YEAR(tac.fecha) as Anio, SUM(tac.Venta) as Ventas
                FROM Tmp_AnalisisComercial_prueba tac
                WHERE YEAR(tac.fecha) IN (${y1}, ${y2})
                ${sectorSQLFilter ? `AND tac.SECTOR LIKE '${sectorSQLFilter}'` : ''}
                GROUP BY YEAR(tac.fecha)`;
              const rTot = await mcpClient.callTool('execute_query', { query: sqlTotales });
              if (rTot && rTot.content && rTot.content[0]) {
                const dataTot = JSON.parse(rTot.content[0].text).data || [];
                const totalY1 = parseFloat((dataTot.find(x => x.Anio === y1)?.Ventas) || 0);
                const totalY2 = parseFloat((dataTot.find(x => x.Anio === y2)?.Ventas) || 0);
                if (!metadataVisualizacion.datos_para_graficos) {
                  metadataVisualizacion.datos_para_graficos = {};
                }
                metadataVisualizacion.datos_para_graficos.totales_por_anio = { [y1]: totalY1, [y2]: totalY2 };
              }
            }
          } catch (errorCompMensual) {
            console.warn('⚠️ No se pudo preparar comparativo mensual:', errorCompMensual.message);
          }

            // ✅ CALCULAR VARIACIÓN DE MARGEN DE CLIENTES vs PERIODO ANTERIOR
            // Solo para consultas de clientes con rentabilidad y año específico
            if (esConsultaClientes && esConsultaRentabilidadMejorMes && añoMencionadoMejorMes && sectorSQLFilter) {
              try {
                console.log(`📊 Calculando variación de margen de clientes: ${añoMencionadoMejorMes} vs ${añoMencionadoMejorMes - 1}...`);
                
                // 1. Obtener top clientes del año actual (ordenados por rentabilidad DESC)
                const clientesActual = dataPreview.data
                  .sort((a, b) => (parseFloat(b.Rentabilidad) || 0) - (parseFloat(a.Rentabilidad) || 0))
                  .slice(0, 9); // Top 9
                
                if (clientesActual.length > 0) {
                  // 2. Extraer códigos de clientes
                  const codigosClientes = clientesActual.map(c => c['Codigo Cliente'] || c.Cliente).filter(Boolean);
                  
                  if (codigosClientes.length > 0) {
                    // 3. Consultar datos del año anterior para estos mismos clientes
                    const codigosClientesSQL = codigosClientes.map(c => `'${c}'`).join(',');
                    const añoAnterior = parseInt(añoMencionadoMejorMes) - 1;
                    
                    const sqlClientesAnterior = `SELECT 
                      tc.[Cliente],
                      tc.[Codigo Cliente],
                      SUM(tac.Venta) as TotalVenta,
                      SUM(tac.Costo) as TotalCosto,
                      SUM(tac.Venta - tac.Costo) as Rentabilidad,
                      CASE WHEN SUM(tac.Venta) > 0 THEN ((SUM(tac.Venta) - SUM(tac.Costo)) / SUM(tac.Venta)) * 100 ELSE 0 END as MargenPct
                    FROM Tmp_AnalisisComercial_prueba tac
                    INNER JOIN temporal_cliente tc ON tac.[Codigo Cliente] = tc.[Codigo Cliente]
                    WHERE YEAR(tac.fecha) = ${añoAnterior}
                    AND tac.SECTOR LIKE '${sectorSQLFilter}'
                    AND tc.[Codigo Cliente] IN (${codigosClientesSQL})
                    GROUP BY tc.[Cliente], tc.[Codigo Cliente]`;
                    
                    const resultadoAnterior = await mcpClient.callTool('execute_query', { query: sqlClientesAnterior });
                    
                    if (resultadoAnterior && resultadoAnterior.content && resultadoAnterior.content[0]) {
                      const dataAnterior = JSON.parse(resultadoAnterior.content[0].text);
                      
                      // 4. Crear mapa de clientes anteriores por código
                      const mapaAnterior = {};
                      if (dataAnterior && dataAnterior.data) {
                        dataAnterior.data.forEach(c => {
                          const codigo = c['Codigo Cliente'];
                          if (codigo) {
                            mapaAnterior[codigo] = {
                              margen: parseFloat(c.MargenPct) || 0,
                              rentabilidad: parseFloat(c.Rentabilidad) || 0
                            };
                          }
                        });
                      }
                      
                      // 5. Calcular variación del margen para cada cliente
                      const clientesConVariacion = clientesActual.map(cliente => {
                        const codigo = cliente['Codigo Cliente'] || cliente.Cliente;
                        const margenActual = parseFloat(cliente.MargenPct) || 0;
                        const margenAnterior = mapaAnterior[codigo]?.margen || null;
                        
                        let variacionMargen = null;
                        if (margenAnterior !== null && margenAnterior !== 0) {
                          variacionMargen = ((margenActual - margenAnterior) / margenAnterior) * 100;
                        } else if (margenAnterior === 0 && margenActual !== 0) {
                          variacionMargen = 100; // Nuevo margen positivo
                        } else if (margenAnterior !== null) {
                          variacionMargen = 0; // Ambos son 0
                        }
                        
                        return {
                          mes: cliente.Cliente, // Usar nombre del cliente como "mes"
                          año: añoMencionadoMejorMes,
                          total: parseFloat(cliente.Rentabilidad) || 0,
                          transacciones: cliente.NumOperaciones || 1,
                          promedio: parseFloat(cliente.TotalVenta) || 0,
                          margen_actual: margenActual,
                          margen_anterior: margenAnterior,
                          variacion_margen: variacionMargen // % de variación del margen
                        };
                      });
                      
                      // 6. Actualizar meses con datos de clientes y variación
                      if (metadataVisualizacion.datos_para_graficos) {
                        metadataVisualizacion.datos_para_graficos.meses = clientesConVariacion;
                        console.log(`✅ Variación de margen calculada para ${clientesConVariacion.length} clientes top`);
                        console.log(`   Ejemplo cliente: ${clientesConVariacion[0].mes}, variación: ${clientesConVariacion[0].variacion_margen?.toFixed(2)}%`);
                      }
                    }
                  }
                }
              } catch (errorVariacion) {
                console.warn('⚠️ No se pudo calcular variación de margen de clientes:', errorVariacion.message);
              }
            }
          }
        
        console.log('🎨 Metadata de visualización generada:', {
          periodo_unico: metadataVisualizacion.periodo_unico,
          cantidad_periodos: metadataVisualizacion.cantidad_periodos,
          metrica_principal: metadataVisualizacion.metrica_principal,
          crecimiento_incluido: !!metadataVisualizacion.datos_para_graficos?.crecimiento_periodo_anterior,
          visualizaciones: Object.keys(metadataVisualizacion.visualizaciones_recomendadas)
            .filter(k => metadataVisualizacion.visualizaciones_recomendadas[k]),
          tiene_meses_en_datos_graficos: !!metadataVisualizacion.datos_para_graficos?.meses,
          cantidad_meses_en_datos_graficos: metadataVisualizacion.datos_para_graficos?.meses?.length,
          primer_mes: metadataVisualizacion.datos_para_graficos?.meses?.[0]
        });
        } catch (metadataError) {
          console.error('❌ Error generando metadata de visualización:', metadataError);
          // Crear metadata básica como fallback
          metadataVisualizacion = {
            tipo_analisis: tipoAnalisis,
            periodo_unico: dataPreview?.data?.length === 1,
            cantidad_periodos: dataPreview?.data?.length || 0,
            visualizaciones_recomendadas: {
              mostrar_tabla_detalle: true
            },
            datos_para_graficos: {}
          };
          // Incluir crecimiento incluso si hay error en metadata
          if (crecimientoCalculado !== null) {
            metadataVisualizacion.datos_para_graficos.crecimiento_periodo_anterior = crecimientoCalculado;
            metadataVisualizacion.datos_para_graficos.tiene_comparacion = tieneComparacion;
          }
        }
        
        // ⚡ GUARDAR EN HISTORIAL (solo si hay permisos)
        if (conversationIdForHistory) {
          try {
            // Intentar guardar - si falla por permisos, continuar sin errores
            await dbService.createMessage(conversationIdForHistory, 'user', message);
            await dbService.createMessage(
              conversationIdForHistory, 
              'assistant', 
              analysisContent,
              usandoTemplate ? 'Template Predefinido' : 'Análisis Automático',
              null,
              queryResult.executionTime
            );
            console.log(`✅ Conversación guardada en historial (ID: ${conversationIdForHistory})`);
          } catch (historyError) {
            // Ignorar errores de permisos silenciosamente
            console.warn('⚠️ Historial no disponible (permisos insuficientes):', historyError.message);
          }
        }
        
        const responseData = {
          success: true,
          response: {
            content: analysisContent,
            mcpToolUsed: usandoTemplate ? 'Template Predefinido' : 'Análisis Automático',
            sqlQuery: null, // Ocultar SQL del usuario
            executionTime: queryResult.executionTime,
            reasoning: usandoTemplate ? 'Consulta optimizada con template' : 'Consulta procesada automáticamente',
            rawData: queryResult,
            dataPreview: dataPreview
          },
          metadata: {
            // Metadata básica (compatibilidad con frontend actual)
            periodo_analizado: `${contextoTemporal.nombre_mes_anterior} ${contextoTemporal.año_mes_anterior}`,
            tipo_analisis: tipoAnalisis,
            estrategia_formateo: estrategiaFormateo,
            usando_template: usandoTemplate,
            intencion_detectada: userIntent,
            cache_stats: getCacheStats(),
            
            // ⚡ NUEVA: Metadata de visualización completa
            visualizacion: metadataVisualizacion,
          
          // ⚡ NUEVO: SQL ejecutado (útil para debugging)
          sql_ejecutado: sqlQuery ? sqlQuery.substring(0, 200) + '...' : null
          }
        };
        
        return res.json(responseData);
      } catch (error) {
        // Este catch cierra el try de la línea 910
        console.warn('⚠️ Error en lógica híbrida, pasando a OpenAI:', error.message);
        // Si hay error en lógica híbrida, pasar a OpenAI
        openaiResponse = await openaiService.chat(
          message, 
          [],
          {
            temperature: 0.3,  // Para respuestas generales
            model: 'gpt-4-turbo-preview',
            toolsEnabled: false
          }
        );
      }
    } else {
      // Consulta que NO requiere datos de BD
      console.log('💬 Consulta conceptual, procesando con OpenAI directamente...');
      openaiResponse = await openaiService.chat(
        message,
        [],
        {
          temperature: 0.3,  // Para respuestas conceptuales
          model: 'gpt-4-turbo-preview',
          toolsEnabled: false
        }
      );
    }
    
    // Si llegamos aquí con openaiResponse, retornar
    if (openaiResponse) {
      return res.json({
        success: true,
        response: {
          content: openaiResponse.content,
          mcpToolUsed: 'OpenAI Chat',
          conversationHistory: openaiResponse.conversationHistory
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error en ruta de chat:', error);
    return res.status(500).json({
      success: false,
      error: 'Error procesando tu consulta',
      details: error.message
    });
  }
});

// ========================================
// RUTAS COMENTADAS (Modo sin autenticación)
// ========================================

/* ❌ COMENTADO PARA MODO SIN AUTENTICACIÓN
router.post('/conversations', requireAuth, validateInput(conversationSchema), async (req, res) => {
  // ... código comentado para modo sin autenticación
});
*/

// Rutas comentadas para modo sin autenticación
/* ❌ COMENTADO PARA MODO SIN AUTENTICACIÓN
router.get('/conversations', requireAuth, async (req, res) => {
  // ... código comentado
});

router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  // ... código comentado
});

router.post('/chat', requireAuth, validateInput(chatSchema), async (req, res) => {
  // ... código comentado para modo sin autenticación
});
*/

// Rutas comentadas para modo sin autenticación
/* ❌ COMENTADO PARA MODO SIN AUTENTICACIÓN
router.get('/tables', requireAuth, async (req, res) => {
  // ... código comentado
});

router.get('/tables/:tableName', requireAuth, async (req, res) => {
  // ... código comentado
});
*/

// Ruta de health check
router.get('/health', async (req, res) => {
  try {
    const mcpHealthy = mcpClient.isHealthy();
    
    res.json({
      status: 'ok',
      services: {
        mcp: mcpHealthy ? 'healthy' : 'unhealthy',
        database: 'disabled', // Deshabilitado en modo sin autenticación
        openai: 'disabled'    // Deshabilitado en modo sin autenticación
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;

