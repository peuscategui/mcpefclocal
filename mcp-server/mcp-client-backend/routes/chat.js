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
  openaiService = new OpenAIService(client);  // Pasar el cliente compartido
}

// Inicializar servicios de base de datos (conexión retrasada hasta que se use)
export async function initializeServices() {
  // ⚠️ SOLO MODE: Intentar conectar a BD de usuarios/conversaciones
  try {
    await dbService.connect();
    console.log('✅ Servicio de historial habilitado');
  } catch (error) {
    console.warn('⚠️ Servicio de historial NO disponible (permisos insuficientes):', error.message);
    console.log('ℹ️ El sistema funcionará sin historial de conversaciones');
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
function construirMetadataVisualizacion(datos, tipoAnalisis, contextoTemporal) {
  // Determinar si es periodo único
  const registros = datos?.data || [];
  const periodoUnico = registros.length === 1;
  
  // Calcular métricas básicas
  let totalVentas = 0;
  let totalTransacciones = 0;
  let mejorMes = null;
  let peorMes = null;
  
  if (registros.length > 0) {
    totalVentas = registros.reduce((sum, r) => sum + (r.Ventas || 0), 0);
    totalTransacciones = registros.reduce((sum, r) => sum + (r.Transacciones || 0), 0);
    
    if (!periodoUnico) {
      const ordenados = [...registros].sort((a, b) => (b.Ventas || 0) - (a.Ventas || 0));
      mejorMes = ordenados[0];
      peorMes = ordenados[ordenados.length - 1];
    }
  }
  
  return {
    tipo_analisis: tipoAnalisis,
    periodo_unico: periodoUnico,
    periodo_analizado: `${contextoTemporal.nombre_mes_anterior} ${contextoTemporal.año_mes_anterior}`,
    cantidad_periodos: registros.length,
    
    // Flags para el frontend sobre qué visualizaciones mostrar
    visualizaciones_recomendadas: {
      mostrar_mejor_peor_mes: !periodoUnico && registros.length >= 2,
      mostrar_comparativa: !periodoUnico && registros.length >= 2,
      mostrar_metricas_basicas: true,
      mostrar_evolucion_diaria: tipoAnalisis === 'ventas_ultimo_mes' && periodoUnico,
      mostrar_tendencia_temporal: !periodoUnico && registros.length >= 3,
      mostrar_grafico_barras: !periodoUnico,
      mostrar_grafico_linea: !periodoUnico && registros.length >= 3,
      mostrar_tabla_detalle: registros.length > 0
    },
    
    // Datos pre-calculados para gráficos
    datos_para_graficos: periodoUnico ? {
      // Datos para periodo único
      total_ventas: registros[0]?.Ventas || 0,
      transacciones: registros[0]?.Transacciones || 0,
      promedio: registros[0]?.PromedioVenta || 0,
      mes: registros[0]?.Mes || contextoTemporal.nombre_mes_anterior,
      año: registros[0]?.Año || contextoTemporal.año_mes_anterior,
      periodo: `${registros[0]?.Mes || contextoTemporal.nombre_mes_anterior} ${registros[0]?.Año || contextoTemporal.año_mes_anterior}`
    } : {
      // Datos para múltiples periodos
      meses: registros.map(d => ({
        mes: d.Mes || d.NombreMes,
        año: d.Año,
        total: d.Ventas || 0,
        transacciones: d.Transacciones || 0,
        promedio: d.PromedioVenta || 0
      })),
      mejor_mes: mejorMes ? {
        mes: mejorMes.Mes || mejorMes.NombreMes,
        año: mejorMes.Año,
        total: mejorMes.Ventas,
        transacciones: mejorMes.Transacciones
      } : null,
      peor_mes: peorMes ? {
        mes: peorMes.Mes || peorMes.NombreMes,
        año: peorMes.Año,
        total: peorMes.Ventas,
        transacciones: peorMes.Transacciones
      } : null,
      total_acumulado: totalVentas,
      total_transacciones: totalTransacciones,
      promedio_mensual: registros.length > 0 ? totalVentas / registros.length : 0
    }
  };
}

// Función para detectar el tipo de análisis requerido
function detectarTipoAnalisis(mensajeUsuario) {
  const mensajeLower = mensajeUsuario.toLowerCase();
  
  // Palabras que indican análisis comparativo (múltiples periodos)
  const palabrasComparativas = [
    'mejor', 'peor', 'comparar', 'comparación', 'comparativo',
    'tendencia', 'evolución', 'crecimiento', 'variación',
    'últimos meses', 'ultimos meses', 'últimos 3 meses',
    'trimestre', 'semestre', 'histórico', 'historia'
  ];
  
  const esComparativo = palabrasComparativas.some(p => mensajeLower.includes(p));
  
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
    'dame', 'muestra', 'obtener'
  ];
  
  const requiereDatos = palabrasCuantitativas.some(palabra => msg.includes(palabra));
  
  console.log('🔍 requiereDatosDeBD:', {
    mensaje: message,
    requiereDatos,
    razon: requiereDatos ? 'Contiene palabras cuantitativas' : 'No contiene palabras cuantitativas'
  });
  
  return requiereDatos;
}

// Función para detectar si falta información crítica en la consulta
function detectarInformacionFaltante(message) {
  const msg = message.toLowerCase();
  
  console.log('🔍 detectarInformacionFaltante - Mensaje:', msg);
  
  // Detectar consultas que requieren período temporal
  const requierePeriodo = [
    'ventas', 'tendencia', 'análisis', 'reporte', 'estadísticas',
    'métricas', 'datos', 'información', 'dame', 'muestra'
  ].some(palabra => msg.includes(palabra));
  
  console.log('🔍 requierePeriodo:', requierePeriodo);
  
  if (!requierePeriodo) {
    return null; // No requiere período
  }
  
  // Verificar si ya tiene período especificado
  const tienePeriodo = 
    msg.includes('2024') || msg.includes('2025') || msg.includes('2023') ||
    msg.includes('enero') || msg.includes('febrero') || msg.includes('marzo') ||
    msg.includes('abril') || msg.includes('mayo') || msg.includes('junio') ||
    msg.includes('julio') || msg.includes('agosto') || msg.includes('septiembre') ||
    msg.includes('octubre') || msg.includes('noviembre') || msg.includes('diciembre') ||
    msg.includes('último mes') || msg.includes('este mes') || msg.includes('mes actual') ||
    msg.includes('este año') || msg.includes('año actual') ||
    msg.includes('últimos') || msg.includes('últimas');
  
  console.log('🔍 tienePeriodo:', tienePeriodo);
  
  if (tienePeriodo) {
    console.log('✅ Ya tiene período especificado, no se requiere aclaración');
    return null; // Ya tiene período especificado
  }
  
  console.log('❗ NO tiene período especificado, se requiere aclaración');
  
  // Detectar tipo de consulta para generar pregunta específica
  if (msg.includes('comparar') || msg.includes('comparativo') || msg.includes('vs') || msg.includes('entre')) {
    return {
      tipo: 'comparativo',
      pregunta: '📅 Para realizar el comparativo, ¿qué períodos deseas comparar?\n\nPor ejemplo:\n• "Compara 2024 vs 2025"\n• "Compara enero 2024 vs enero 2025"\n• "Compara el último trimestre de 2024 vs 2025"'
    };
  }
  
  if (msg.includes('tendencia') || msg.includes('evolución')) {
    return {
      tipo: 'tendencia',
      pregunta: '📅 Para mostrar la tendencia, ¿de qué período deseas ver los datos?\n\nPor ejemplo:\n• "Tendencia de ventas del 2025"\n• "Tendencia de ventas del último año"\n• "Tendencia de ventas de enero a octubre 2025"'
    };
  }
  
  if (msg.includes('ventas') || msg.includes('información') || msg.includes('datos')) {
    return {
      tipo: 'consulta_general',
      pregunta: '📅 ¿De qué período deseas ver la información?\n\nPor ejemplo:\n• "Ventas del 2025"\n• "Ventas del último mes"\n• "Ventas de octubre 2025"\n• "Ventas del año actual"'
    };
  }
  
  return null;
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
    
    // ⚡ HISTORIAL: Deshabilitado si no hay permisos de escritura
    let conversationIdForHistory = conversationId;
    
    if (!conversationId) {
      console.log('ℹ️ Sin conversationId - sin guardar historial (permisos insuficientes)');
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
      
      // ✅ PASO 0: Verificar si falta información crítica
      // ⚠️ DESHABILITADO: Causaba problemas con "último mes" y otras consultas válidas
      // const infoFaltante = detectarInformacionFaltante(message);
      // if (infoFaltante) {
      //   console.log('❓ Información faltante detectada:', infoFaltante.tipo);
      //   return res.json({
      //     success: true,
      //     response: {
      //       content: infoFaltante.pregunta,
      //       mcpToolUsed: 'Aclaración Requerida',
      //       needsClarification: true,
      //       clarificationType: infoFaltante.tipo
      //     }
      //   });
      // }
      
      try {
        // Paso 1: Obtener estructura de la tabla
        console.log('📋 Obteniendo estructura de tabla...');
        const describeResult = await mcpClient.describeTable('Tmp_AnalisisComercial_prueba');
        const tableStructure = describeResult.content[0].text;
        
         // ✅ PASO 2: Normalizar consulta con contexto temporal
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
         
         // 3.1: Intentar obtener del caché
         console.log('\n' + '-'.repeat(80));
         console.log('💾 PASO 3.1: BÚSQUEDA EN CACHÉ');
         console.log('-'.repeat(80));
         
         sqlQuery = getCachedQuery(userIntent, periodo);
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
         
         // 3.3: Si no hay template, usar OpenAI
         if (!sqlQuery) {
           console.log('\n' + '-'.repeat(80));
           console.log('🤖 PASO 3.3: GENERACIÓN CON OPENAI');
           console.log('-'.repeat(80));
           console.log('⚠️ No hay caché ni template disponible');
           console.log('🧠 Solicitando a OpenAI que genere SQL...');
           console.log('⏱️ Tiempo estimado: ~2000ms (LENTO pero inteligente)');
           console.log('-'.repeat(80) + '\n');
         
         const SYSTEM_PROMPT = `Eres un analista de datos comerciales experto en SQL y análisis de ventas B2B.

## 📅 CONTEXTO TEMPORAL CRÍTICO
- Fecha actual del sistema: ${contextoTemporal.fecha_actual}
- Año actual: ${contextoTemporal.año_actual}
- Mes actual: ${contextoTemporal.mes_actual} (${contextoTemporal.nombre_mes_actual})
- Mes anterior (último mes): ${contextoTemporal.mes_anterior} (${contextoTemporal.nombre_mes_anterior} ${contextoTemporal.año_mes_anterior})

## 🗄️ ESTRUCTURA DE LA BASE DE DATOS
Tabla principal: Tmp_AnalisisComercial_prueba

Columnas:
- fecha (DATETIME): Fecha de la transacción
- venta (DECIMAL(18,2)): Monto de venta
- cliente (VARCHAR(255)): Nombre del cliente
- producto (VARCHAR(255)): Producto/servicio vendido
- sector (VARCHAR(100)): Sector comercial

## ⚡ REGLAS ESTRICTAS PARA GENERAR SQL

### 1. Interpretación de Periodos Temporales
Cuando el usuario diga:

**"último mes"** → Mes calendario COMPLETO anterior al actual
\`\`\`sql
-- Último mes = ${contextoTemporal.nombre_mes_anterior} ${contextoTemporal.año_mes_anterior}
WHERE YEAR(fecha) = ${contextoTemporal.año_mes_anterior}
  AND MONTH(fecha) = ${contextoTemporal.mes_anterior}
\`\`\`

**"este mes"** → Mes calendario actual hasta hoy
\`\`\`sql
WHERE YEAR(fecha) = ${contextoTemporal.año_actual}
  AND MONTH(fecha) = ${contextoTemporal.mes_actual}
\`\`\`

**"últimos 30 días"** → Últimos 30 días naturales desde hoy
\`\`\`sql
WHERE fecha >= DATEADD(DAY, -30, GETDATE())
  AND fecha <= GETDATE()
\`\`\`

### 2. SIEMPRE Usar Estas Queries Exactas

#### Para "ventas del último mes":
\`\`\`sql
SELECT 
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
WHERE YEAR(fecha) = YEAR(DATEADD(MONTH, -1, GETDATE()))
  AND MONTH(fecha) = MONTH(DATEADD(MONTH, -1, GETDATE()))
GROUP BY YEAR(fecha), MONTH(fecha)
\`\`\`

#### Para "ventas por día del último mes":
\`\`\`sql
SELECT 
    CAST(fecha AS DATE) as Dia,
    SUM(venta) as Ventas,
    COUNT(*) as Transacciones
FROM Tmp_AnalisisComercial_prueba
WHERE YEAR(fecha) = YEAR(DATEADD(MONTH, -1, GETDATE()))
  AND MONTH(fecha) = MONTH(DATEADD(MONTH, -1, GETDATE()))
GROUP BY CAST(fecha AS DATE)
ORDER BY Dia
\`\`\`

#### Para "septiembre 2025" o cualquier MES ESPECÍFICO:
\`\`\`sql
SELECT 
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
WHERE YEAR(fecha) = 2025
  AND MONTH(fecha) = 9  -- 9 para septiembre
GROUP BY YEAR(fecha), MONTH(fecha)
\`\`\`

#### Para "ventas del 2025" (AÑO COMPLETO):
\`\`\`sql
SELECT 
    YEAR(fecha) as Año,
    MONTH(fecha) as MesNumero,
    CASE MONTH(fecha)
      WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
      WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
      WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
      WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
    END as Mes,
    SUM(venta) as Ventas,
    COUNT(*) as Transacciones
FROM Tmp_AnalisisComercial_prueba
WHERE YEAR(fecha) = 2025
GROUP BY YEAR(fecha), MONTH(fecha)
ORDER BY MesNumero
\`\`\`

#### Para "comparativo 2024 vs 2025":
\`\`\`sql
SELECT 
    YEAR(fecha) as Año,
    MONTH(fecha) as MesNumero,
    CASE MONTH(fecha)
      WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
      WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
      WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
      WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
    END as Mes,
    SUM(venta) as Ventas,
    COUNT(*) as Transacciones
FROM Tmp_AnalisisComercial_prueba
WHERE YEAR(fecha) IN (2024, 2025)
GROUP BY YEAR(fecha), MONTH(fecha)
ORDER BY Año, MesNumero
\`\`\`

### 3. Validación de Datos
- Si el resultado está vacío, INFORMAR que no hay datos para ese periodo
- Si hay ventas negativas, explicar que son devoluciones/notas de crédito
- SIEMPRE incluir el periodo exacto analizado en la respuesta

### 4. INSTRUCCIONES CRÍTICAS

**REGLA #1: Detectar si es MES ESPECÍFICO o AÑO COMPLETO**
- "septiembre 2025" = MES ESPECÍFICO → USA: WHERE YEAR(fecha) = 2025 AND MONTH(fecha) = 9
- "ventas del 2025" = AÑO COMPLETO → USA: WHERE YEAR(fecha) = 2025 (SIN MONTH)
- "ventas 2025" = AÑO COMPLETO → USA: WHERE YEAR(fecha) = 2025 (SIN MONTH)

**REGLA #2: Meses específicos requieren MONTH()**
Si el usuario menciona: enero, febrero, marzo, abril, mayo, junio, julio, agosto, septiembre, octubre, noviembre, diciembre
→ DEBES agregar: AND MONTH(fecha) = [número del mes]

**REGLA #3: Años sin mes NO requieren MONTH()**
Si el usuario solo menciona "2024" o "2025" SIN un mes específico
→ NO agregues MONTH() al WHERE

**MAPEO DE MESES:**
Enero=1, Febrero=2, Marzo=3, Abril=4, Mayo=5, Junio=6, Julio=7, Agosto=8, Septiembre=9, Octubre=10, Noviembre=11, Diciembre=12

## 🚫 PROHIBICIONES
- NUNCA uses DATEADD con -1 para días si el usuario pide "último mes"
- NUNCA cambies el SQL entre ejecuciones de la misma consulta
- NUNCA inventes datos si no existen
- NUNCA uses >= DATEADD(MONTH, -1, GETDATE()) para "último mes" (esto da los últimos 30 días, NO el mes anterior)

RESPONDE SOLO CON EL SQL, SIN EXPLICACIONES.`;

         const sqlPrompt = `${SYSTEM_PROMPT}

${mensajeEnriquecido}

Genera el SQL apropiado copiando EXACTAMENTE uno de los ejemplos de arriba.`;

          // ⚡ CRÍTICO: temperature = 0 para máxima consistencia en generación de SQL
          const sqlResponse = await openaiService.chat(sqlPrompt, [], {
            temperature: 0,
            model: 'gpt-4-turbo-preview'
          });
          sqlQuery = sqlResponse.content.trim();
          
          console.log('🌡️ Temperature usada: 0 (máxima consistencia)');
          
          // Limpiar markdown si existe
          sqlQuery = sqlQuery.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
          
          console.log('✅ SQL generado por OpenAI:', sqlQuery);
          
          // Guardar en caché para próximas consultas
          setCachedQuery(userIntent, periodo, sqlQuery);
        } // Fin del if (!sqlQuery)
        
        console.log('📝 SQL final a ejecutar:', sqlQuery);
        
        // Validar que sea un SELECT válido
        if (!sqlQuery || !sqlQuery.toLowerCase().includes('select')) {
          console.error('❌ ERROR: SQL generado no es válido');
          return res.status(500).json({
            success: false,
            error: 'No pude generar una consulta SQL válida. Por favor, intenta reformular tu pregunta.',
            suggestion: 'Ejemplos: "ventas del último mes", "ventas del 2025", "comparativo 2024 vs 2025"'
          });
        }
        
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
        
        // ✅ CALCULAR TOTALES REALES ANTES DE ENVIAR A OPENAI
        let totalCalculado2024 = 0;
        let totalCalculado2025 = 0;
        
        if (dataForAI && dataForAI.data) {
          dataForAI.data.forEach(row => {
            if (row.Año === 2024 && row.Ventas) {
              totalCalculado2024 += parseFloat(row.Ventas);
            } else if (row.Año === 2025 && row.Ventas) {
              totalCalculado2025 += parseFloat(row.Ventas);
            }
          });
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
        
        const analysisPrompt = `Analiza estos datos de ventas y proporciona un informe ejecutivo COMPLETO.

DATOS:
${JSON.stringify(dataForAI, null, 2)}

${totalCalculado2024 > 0 || totalCalculado2025 > 0 ? `
TOTALES EXACTOS (USA ESTOS NÚMEROS):
- Total 2024: S/ ${totalCalculado2024.toFixed(2)}
- Total 2025: S/ ${totalCalculado2025.toFixed(2)}

⚠️ IMPORTANTE: USA EXACTAMENTE ESTOS TOTALES. NO los calcules tú mismo.
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

FORMATO REQUERIDO:

# 📊 [Título del Análisis]

## 📈 Métricas Clave
- **Total Ventas**: S/ [monto]
- **Promedio Mensual**: S/ [monto]
- **Mejor Mes**: [mes] (S/ [monto])
- **Mes Bajo**: [mes] (S/ [monto])

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
          model: 'gpt-4-turbo-preview'
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
        
        // Construir metadata de visualización para el frontend
        const metadataVisualizacion = construirMetadataVisualizacion(
          dataPreview,
          tipoAnalisis,
          contextoTemporal
        );
        
        console.log('🎨 Metadata de visualización generada:', {
          periodo_unico: metadataVisualizacion.periodo_unico,
          cantidad_periodos: metadataVisualizacion.cantidad_periodos,
          visualizaciones: Object.keys(metadataVisualizacion.visualizaciones_recomendadas)
            .filter(k => metadataVisualizacion.visualizaciones_recomendadas[k])
        });
        
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
        
        return res.json({
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
            visualizacion: metadataVisualizacion
          },
          
          // ⚡ NUEVO: SQL ejecutado (útil para debugging)
          sql_ejecutado: sqlQuery ? sqlQuery.substring(0, 200) + '...' : null
        });
        
      } catch (error) {
        console.warn('⚠️ Error en lógica híbrida, pasando a OpenAI:', error.message);
        // Si hay error en lógica híbrida, pasar a OpenAI
        openaiResponse = await openaiService.chat(
          message, 
          [],
          {
            temperature: 0.3,  // Para respuestas generales
            model: 'gpt-4-turbo-preview'
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
          model: 'gpt-4-turbo-preview'
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
