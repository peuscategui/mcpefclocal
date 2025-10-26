// utils/query-cache.js
// Sistema de caché para queries SQL generadas por OpenAI

const queryCache = new Map();

/**
 * Obtiene una query SQL del caché
 * @param {string} userIntent - Intención del usuario (ej: "ventas_ultimo_mes")
 * @param {string} periodo - Periodo temporal (ej: "2025-09")
 * @returns {string|null} - Query SQL cacheada o null
 */
function getCachedQuery(userIntent, periodo) {
  const cacheKey = `${userIntent}_${periodo}`;
  const cached = queryCache.get(cacheKey);
  
  if (cached) {
    console.log(`✅ Query encontrada en caché: ${cacheKey}`);
    return cached;
  }
  
  console.log(`❌ Query NO encontrada en caché: ${cacheKey}`);
  return null;
}

/**
 * Guarda una query SQL en el caché
 * @param {string} userIntent - Intención del usuario
 * @param {string} periodo - Periodo temporal
 * @param {string} sqlQuery - Query SQL a cachear
 */
function setCachedQuery(userIntent, periodo, sqlQuery) {
  const cacheKey = `${userIntent}_${periodo}`;
  queryCache.set(cacheKey, sqlQuery);
  
  console.log(`💾 Query guardada en caché: ${cacheKey}`);
  console.log(`📊 Tamaño actual del caché: ${queryCache.size} queries`);
  
  // Limpiar cache después de 1 hora
  setTimeout(() => {
    queryCache.delete(cacheKey);
    console.log(`🗑️ Query eliminada del caché (expiró): ${cacheKey}`);
  }, 3600000); // 1 hora = 3600000 ms
}

/**
 * Limpia todo el caché
 */
function clearCache() {
  const size = queryCache.size;
  queryCache.clear();
  console.log(`🗑️ Caché limpiado completamente (${size} queries eliminadas)`);
}

/**
 * Obtiene estadísticas del caché
 */
function getCacheStats() {
  return {
    size: queryCache.size,
    keys: Array.from(queryCache.keys())
  };
}

/**
 * Detecta la intención del usuario basándose en el mensaje
 * @param {string} message - Mensaje del usuario
 * @returns {string} - Intención detectada
 */
function detectUserIntent(message) {
  const msg = message.toLowerCase();
  
  // Detectar "último mes"
  if (msg.includes('último mes') || msg.includes('ultimo mes')) {
    if (msg.includes('detalle') || msg.includes('día') || msg.includes('dia') || msg.includes('diario')) {
      return 'ventas_ultimo_mes_detalle';
    }
    return 'ventas_ultimo_mes';
  }
  
  // Detectar "este mes"
  if (msg.includes('este mes') || msg.includes('mes actual')) {
    return 'ventas_este_mes';
  }
  
  // Detectar "últimos X meses" o "últimos meses"
  if (msg.includes('últimos') && msg.includes('meses')) {
    return 'ventas_ultimos_meses';
  }
  
  // Detectar comparativo
  if ((msg.includes('comparativo') || msg.includes('comparar') || msg.includes('vs')) && 
      msg.includes('2024') && msg.includes('2025')) {
    return 'comparativo_2024_2025';
  }
  
  // Detectar año específico
  if (msg.includes('2024') && !msg.includes('2025')) {
    return 'ventas_2024';
  }
  
  if (msg.includes('2025') && !msg.includes('2024')) {
    return 'ventas_2025';
  }
  
  // Intención genérica
  return 'consulta_generica';
}

// Queries predefinidas para casos comunes
const QUERY_TEMPLATES = {
  // Template mejorado para último mes (sin comparaciones)
  ventas_ultimo_mes: (año, mes) => `
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
    AVG(venta) as PromedioVenta,
    MIN(venta) as VentaMinima,
    MAX(venta) as VentaMaxima
FROM Tmp_AnalisisComercial_prueba
WHERE YEAR(fecha) = ${año}
  AND MONTH(fecha) = ${mes}
GROUP BY YEAR(fecha), MONTH(fecha)
  `.trim(),
  
  ventas_ultimo_mes_detalle: (año, mes) => `
SELECT 
    CAST(fecha AS DATE) as Dia,
    SUM(venta) as Ventas,
    COUNT(*) as Transacciones
FROM Tmp_AnalisisComercial_prueba
WHERE YEAR(fecha) = ${año}
  AND MONTH(fecha) = ${mes}
GROUP BY CAST(fecha AS DATE)
ORDER BY Dia
  `.trim(),
  
  ventas_este_mes: (año, mes) => `
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
WHERE YEAR(fecha) = ${año}
  AND MONTH(fecha) = ${mes}
GROUP BY YEAR(fecha), MONTH(fecha)
  `.trim(),
  
  comparativo_2024_2025: () => `
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
  `.trim(),
  
  ventas_2024: () => `
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
WHERE YEAR(fecha) = 2024
GROUP BY YEAR(fecha), MONTH(fecha)
ORDER BY MesNumero
  `.trim(),
  
  ventas_2025: () => `
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
  `.trim(),
  
  // NUEVO: Template para comparar múltiples meses recientes
  ventas_ultimos_meses: (cantidadMeses = 3) => `
WITH MesesRecientes AS (
    SELECT DISTINCT
        YEAR(fecha) as Año,
        MONTH(fecha) as Mes,
        DATEFROMPARTS(YEAR(fecha), MONTH(fecha), 1) as Periodo
    FROM Tmp_AnalisisComercial_prueba
    WHERE fecha >= DATEADD(MONTH, -${cantidadMeses}, GETDATE())
)
SELECT 
    mr.Año,
    mr.Mes as MesNumero,
    CASE mr.Mes
        WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
        WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
        WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
        WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
    END as NombreMes,
    COALESCE(SUM(t.venta), 0) as Ventas,
    COUNT(t.venta) as Transacciones,
    AVG(t.venta) as PromedioVenta
FROM MesesRecientes mr
LEFT JOIN Tmp_AnalisisComercial_prueba t
    ON YEAR(t.fecha) = mr.Año AND MONTH(t.fecha) = mr.Mes
GROUP BY mr.Año, mr.Mes, mr.Periodo
ORDER BY mr.Año DESC, mr.Mes DESC
  `.trim()
};

/**
 * Intenta obtener una query de los templates predefinidos
 * @param {string} userIntent - Intención detectada
 * @param {object} contextoTemporal - Contexto temporal del sistema
 * @returns {string|null} - Query SQL del template o null
 */
function getQueryFromTemplate(userIntent, contextoTemporal) {
  const template = QUERY_TEMPLATES[userIntent];
  
  if (!template) {
    console.log(`❌ No hay template para: ${userIntent}`);
    return null;
  }
  
  console.log(`📋 Usando template predefinido para: ${userIntent}`);
  
  // Generar query según el template
  switch (userIntent) {
    case 'ventas_ultimo_mes':
      return template(contextoTemporal.año_mes_anterior, contextoTemporal.mes_anterior);
    
    case 'ventas_ultimo_mes_detalle':
      return template(contextoTemporal.año_mes_anterior, contextoTemporal.mes_anterior);
    
    case 'ventas_este_mes':
      return template(contextoTemporal.año_actual, contextoTemporal.mes_actual);
    
    case 'comparativo_2024_2025':
    case 'ventas_2024':
    case 'ventas_2025':
      return template();
    
    case 'ventas_ultimos_meses':
      // Por defecto, últimos 3 meses
      return template(3);
    
    default:
      return null;
  }
}

export { 
  getCachedQuery, 
  setCachedQuery, 
  clearCache,
  getCacheStats,
  detectUserIntent,
  getQueryFromTemplate,
  QUERY_TEMPLATES 
};

