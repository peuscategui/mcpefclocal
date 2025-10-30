// components/VisualizacionEjecutiva.jsx
import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

function formatMoneda(valor) {
  if (!valor) return 'S/ 0.00';
  return `S/ ${Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatPorcentaje(valor) {
  if (!valor) return '0%';
  return `${Number(valor).toFixed(1)}%`;
}
// Tarjetas comparativas mensuales (YYYY vs YYYY)
function TarjetasComparativoMensual({ comp }) {
  if (!comp || !comp.filas || comp.filas.length === 0) return null;
  const { anio_base, anio_comp, filas } = comp;
  return (
    <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100">
      <h3 className="text-lg font-bold text-gray-800 mb-4">📊 Comparativo Mensual {anio_base} vs {anio_comp}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filas.map((f, i) => {
          const up = (f.delta_pct || 0) > 0;
          const neutral = (f.delta_pct || 0) === 0;
          return (
            <div key={i} className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs text-gray-500 mb-1">{f.mes_nombre}</div>
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <div className="text-gray-700">{anio_base}: <b>{formatMoneda(f.y1)}</b></div>
                  <div className="text-gray-700">{anio_comp}: <b>{formatMoneda(f.y2)}</b></div>
                </div>
                <div className={`text-sm font-bold ${neutral ? 'text-gray-600' : (up ? 'text-green-600' : 'text-red-600')}`}>
                  {neutral ? '—' : (up ? '↑' : '↓')} {formatPorcentaje(f.delta_pct)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// KPIs para comparativo (totales por año y crecimiento)
function KPIsComparativo({ totales, comp }) {
  if (!totales || !comp) return null;
  const { anio_base, anio_comp } = comp;
  const totalBase = Number(totales[anio_base] || 0);
  const totalComp = Number(totales[anio_comp] || 0);
  const crecimiento = totalBase ? ((totalComp - totalBase) / totalBase) * 100 : (totalComp > 0 ? 100 : 0);

  return (
    <div className="grid gap-3 mb-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
      <TarjetaKPI titulo={`Total ${anio_base}`} valor={formatMoneda(totalBase)} color="blue" />
      <TarjetaKPI titulo={`Total ${anio_comp}`} valor={formatMoneda(totalComp)} color="green" />
      <TarjetaKPI titulo={`Crecimiento`} valor={formatPorcentaje(crecimiento)} color={crecimiento >= 0 ? 'green' : 'orange'} />
    </div>
  );
}

// Gráfico de líneas comparativo simple en SVG (2024 vs 2025)
function LineChartComparativo({ comp }) {
  if (!comp || !comp.filas || comp.filas.length === 0) return null;
  const width = 900; const height = 260; const padding = 40;
  const dataX = comp.filas.map((f, i) => i);
  const y1Vals = comp.filas.map(f => Number(f.y1 || 0));
  const y2Vals = comp.filas.map(f => Number(f.y2 || 0));
  const maxY = Math.max(1, ...y1Vals, ...y2Vals);
  const xStep = (width - padding * 2) / Math.max(1, comp.filas.length - 1);

  const toPath = (vals) => vals.map((v, i) => {
    const x = padding + xStep * i;
    const y = height - padding - (v / maxY) * (height - padding * 2);
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');

  const path1 = toPath(y1Vals);
  const path2 = toPath(y2Vals);

  return (
    <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100">
      <div className="flex items-center gap-4 mb-3">
        <div className="text-lg font-bold text-gray-800">Evolución mensual {comp.anio_base} vs {comp.anio_comp}</div>
        <div className="text-xs text-gray-500">Escala relativa al máximo</div>
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`}> 
        {/* Ejes simples */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e5e7eb" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#e5e7eb" />
        {/* Líneas */}
        <path d={path1} fill="none" stroke="#2563eb" strokeWidth="2" />
        <path d={path2} fill="none" stroke="#10b981" strokeWidth="2" />
      </svg>
      <div className="flex items-center gap-6 mt-3 text-sm">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />{comp.anio_base}</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" />{comp.anio_comp}</div>
      </div>
    </div>
  );
}


// Tarjeta KPI Grande (estilo ejecutivo con colores suaves)
function TarjetaKPI({ titulo, valor, color = "blue", icono }) {
  const colores = {
    blue: {
      border: "border-blue-500",
      bg: "bg-blue-50",
      text: "text-blue-900",
      iconBg: "bg-blue-500"
    },
    green: {
      border: "border-green-500",
      bg: "bg-green-50",
      text: "text-green-900",
      iconBg: "bg-green-500"
    },
    purple: {
      border: "border-purple-500",
      bg: "bg-purple-50",
      text: "text-purple-900",
      iconBg: "bg-purple-500"
    },
    orange: {
      border: "border-orange-500",
      bg: "bg-orange-50",
      text: "text-orange-900",
      iconBg: "bg-orange-500"
    }
  };

  const colorScheme = colores[color];

  return (
    <div className={`${colorScheme.bg} border-l-4 ${colorScheme.border} rounded-lg p-3 shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-medium ${colorScheme.text} opacity-80`}>{titulo}</span>
        {icono && <span className="text-lg">{icono}</span>}
      </div>
      <div className={`text-xl font-bold ${colorScheme.text}`}>{valor}</div>
    </div>
  );
}

// Análisis Mensual Mejorado (más claro y auto-explicativo - tarjetas más grandes)
function AnalisisMensual({ datos, contexto = 'periodos' }) {
  if (!datos || datos.length === 0) return null;

  // Limitar a 9 items (3x3 grid) - puede ser meses o clientes
  const datosLimitados = datos.slice(0, 9);

  // Detectar si tenemos variación de margen (cliente vs periodo anterior)
  const tieneVariacionMargen = datosLimitados.some(d => d.variacion_margen !== undefined && d.variacion_margen !== null);
  const añoActual = datosLimitados[0]?.año || new Date().getFullYear();
  const añoAnterior = añoActual - 1;
  
  // Título dinámico según contexto
  const titulo = tieneVariacionMargen && contexto === 'clientes'
    ? `📊 Variación de Margen (${añoActual} vs ${añoAnterior})`
    : contexto === 'clientes'
    ? '📊 Variación Mensual (vs periodo anterior)'
    : '📊 Variación Mensual (vs periodo anterior)';

  return (
    <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100 h-full flex flex-col">
      <h3 className="text-lg font-bold text-gray-800 mb-4">
        {titulo}
      </h3>
      <div className="grid grid-cols-3 gap-4 flex-1">
        {datosLimitados.map((item, index) => {
          // Si tiene variación_margen, usarla (es comparación con periodo anterior)
          // Si no, calcular variación entre items consecutivos (comparación entre items)
          let cambio = null;
          if (tieneVariacionMargen && item.variacion_margen !== null && item.variacion_margen !== undefined) {
            cambio = item.variacion_margen;
          } else if (!tieneVariacionMargen && index > 0 && datos[index - 1]) {
            const actual = item.total;
            const anterior = datos[index - 1].total;
            if (anterior && anterior !== 0) {
              cambio = ((actual - anterior) / anterior) * 100;
            }
          }
          
          const esCrecimiento = cambio !== null && cambio > 0;
          const esNeutro = cambio !== null && cambio === 0;
          
          return (
            <div key={index} className={`rounded-lg p-4 flex flex-col justify-between ${
              cambio === null ? 'bg-gray-100' : 
              esNeutro ? 'bg-gray-100' :
              esCrecimiento ? 'bg-green-50 border border-green-200' : 
              'bg-red-50 border border-red-200'
            }`}>
              <div className="font-semibold text-gray-800 text-sm mb-2 leading-tight">
                {item.mes || item.Cliente || 'N/A'}
              </div>
              <div className="mt-auto">
                {cambio !== null ? (
                  <div className="flex items-center gap-2">
                    {esNeutro ? null : esCrecimiento ? (
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-600" />
                    )}
                    <span className={`text-sm font-bold ${
                      esNeutro ? 'text-gray-600' :
                      esCrecimiento ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {esCrecimiento ? '+' : ''}{formatPorcentaje(cambio)}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-500 font-medium">
                    {tieneVariacionMargen ? 'Sin datos previos' : 'Inicio'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Resumen Ejecutivo con KPIs (mejorado y auto-explicativo)
// Ahora incluye Mejor y Peor Mes en la misma línea
function ResumenEjecutivo({ datos, mejor, peor, contexto = 'periodos' }) {
  // ✅ DEBUG: Ver todos los datos recibidos
  console.log('📊 ResumenEjecutivo - Datos completos recibidos:', {
    datos_completos: datos,
    total_acumulado: datos.total_acumulado,
    promedio_mensual: datos.promedio_mensual,
    total_ventas: datos.total_ventas,
    promedio: datos.promedio,
    tiene_meses: !!datos.meses,
    cantidad_meses: datos.meses?.length
  });
  
  // Intentar múltiples formas de obtener el total (orden de prioridad)
  const total = datos.total_acumulado || datos.total_ventas_real || datos.total_ventas || datos.total || 0;
  // Intentar múltiples formas de obtener el promedio
  const promedio = datos.promedio_mensual || datos.promedio || datos.promedio_venta || 0;
  
  console.log('📊 Valores finales calculados:', { total, promedio });
  
  // ✅ Usar crecimiento calculado desde el backend (comparado con periodo anterior del mismo sector)
  console.log('📊 Datos de crecimiento recibidos:', {
    crecimiento_backend: datos.crecimiento_periodo_anterior,
    tiene_comparacion: datos.tiene_comparacion,
    tiene_meses: !!datos.meses,
    cantidad_meses: datos.meses?.length
  });
  
  let crecimiento = datos.crecimiento_periodo_anterior !== undefined ? datos.crecimiento_periodo_anterior : null;
  let textoCrecimiento = '—';
  let tieneComparacion = datos.tiene_comparacion || false;
  
  // Si el backend calculó el crecimiento, usarlo directamente
  if (crecimiento !== null && tieneComparacion && !isNaN(crecimiento) && isFinite(crecimiento)) {
    const signo = crecimiento > 0 ? '+' : '';
    textoCrecimiento = `${signo}${formatPorcentaje(crecimiento)}`;
    console.log('✅ Usando crecimiento del backend:', crecimiento);
  } else if (crecimiento === null && datos.meses && datos.meses.length >= 2) {
    // Fallback: calcular desde datos mensuales (solo si no hay cálculo del backend)
    // ⚠️ NOTA: Este cálculo compara último vs primer mes del MISMO periodo, no periodo anterior
    // Por eso solo se usa como fallback cuando NO hay cálculo del backend
    console.log('⚠️ Usando fallback: comparando último vs primer mes (NO es vs periodo anterior)');
    const mesesOrdenados = [...datos.meses].sort((a, b) => {
      if (a.año !== b.año) return a.año - b.año;
      // Ordenar por nombre de mes (esto asume que vienen en orden lógico)
      return 0;
    });
    
    const primerMes = mesesOrdenados[0];
    const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1];
    
    if (primerMes && ultimoMes && primerMes.total > 0 && primerMes.total !== ultimoMes.total) {
      crecimiento = ((ultimoMes.total - primerMes.total) / primerMes.total) * 100;
      if (!isNaN(crecimiento) && isFinite(crecimiento)) {
        const signo = crecimiento > 0 ? '+' : '';
        textoCrecimiento = `${signo}${formatPorcentaje(crecimiento)}`;
        tieneComparacion = true;
        console.log('⚠️ Crecimiento fallback calculado:', crecimiento, '(último mes vs primer mes del mismo periodo)');
      } else {
        crecimiento = null;
        textoCrecimiento = '—';
      }
    } else {
      crecimiento = null;
      textoCrecimiento = '—';
      console.log('⚠️ No se puede calcular crecimiento fallback: primer mes sin datos válidos');
    }
  } else {
    console.log('⚠️ No hay datos para calcular crecimiento');
  }

  // Decidir layout según si hay datos temporales o no
  const tieneDataTemporal = datos.meses && datos.meses.length >= 2;
  const tieneMejorPeor = mejor && peor;
  const tieneMargen = datos.margen_porcentual !== undefined;
  
  // Solo mostrar crecimiento si:
  // 1. Hay comparación calculada desde el backend (vs periodo anterior del sector), O
  // 2. Hay datos mensuales temporales (no es consulta de clientes)
  // NO mostrar si es consulta de clientes sin comparación del backend (no tiene sentido comparar primer vs último cliente)
  const puedeMostrarCrecimiento = tieneComparacion || (tieneDataTemporal && contexto !== 'clientes');
  
  // ✅ Debug: Verificar que el componente se está renderizando
  console.log('🎨 ResumenEjecutivo renderizando con:', {
    total,
    promedio,
    tiene_mejor: !!mejor,
    tiene_peor: !!peor,
    tiene_margen: datos.margen_porcentual !== undefined,
    tiene_mejor_mes_periodo: !!datos.mejor_mes_periodo
  });
  
  return (
    <div className={`grid gap-3 mb-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5`}>
      {/* Tarjeta 1: Total Acumulado - SIEMPRE mostrar */}
      <TarjetaKPI 
        titulo="💰 Total Acumulado" 
        valor={formatMoneda(total)} 
        color="blue"
        icono=""
      />
      
      {/* Tarjeta 2: Promedio - SIEMPRE mostrar */}
      <TarjetaKPI 
        titulo="📊 Promedio" 
        valor={formatMoneda(promedio)} 
        color="green"
        icono=""
      />
      
      {/* Tarjeta 3: Crecimiento (solo si hay comparación válida) */}
      {puedeMostrarCrecimiento && (
        <TarjetaKPI 
          titulo={`📈 Crecimiento vs periodo anterior`}
          valor={textoCrecimiento}
          color={!tieneComparacion || crecimiento === null ? "blue" : (crecimiento >= 0 ? "green" : "orange")}
          icono=""
        />
      )}
      
      {/* Tarjeta 4: Mejor Mes del Periodo (si hay datos de mejor_mes_periodo) o Mejor Cliente/Mes (fallback) */}
      {datos.mejor_mes_periodo ? (
        <TarjetaKPI 
          titulo="🏆 Mejor Mes"
          valor={`${datos.mejor_mes_periodo.mes} ${datos.mejor_mes_periodo.año}: ${formatMoneda(datos.mejor_mes_periodo.rentabilidad)}`}
          color="green"
          icono=""
        />
      ) : tieneMejorPeor && (
        <TarjetaKPI 
          titulo={contexto === 'clientes' ? '🏆 Mejor Cliente' : '🏆 Mejor Mes'}
          valor={`${mejor?.mes ? `${mejor.mes} ${mejor?.año || ''}: ` : ''}${formatMoneda(mejor.total)}`}
          color="green"
          icono=""
        />
      )}
      
      {/* Tarjeta 5: Margen (reemplaza Peor Cliente/Mes) */}
      {datos.margen_porcentual !== undefined && (
        <TarjetaKPI 
          titulo="📊 Margen"
          valor={formatPorcentaje(datos.margen_porcentual)}
          color="purple"
          icono=""
        />
      )}
    </div>
  );
}

// Mejor y Peor Mes (lado a lado, más claros y auto-explicativos - compactos)
function MejorPeorMes({ mejor, peor }) {
  if (!mejor || !peor) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Mejor Mes */}
      <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <div className="bg-green-500 rounded-full p-1">
            <TrendingUp className="w-3 h-3 text-white" />
          </div>
          <h4 className="font-bold text-green-900 text-xs">🏆 Mejor Mes</h4>
        </div>
        <div className="text-xs text-green-700 mb-1">{mejor.mes} {mejor.año}</div>
        <div className="text-lg font-bold text-green-900">
          {formatMoneda(mejor.total)}
        </div>
        <div className="text-xs text-green-600 mt-0.5">
          {mejor.transacciones} operaciones
        </div>
      </div>

      {/* Peor Mes */}
      <div className="bg-orange-50 border-l-4 border-orange-500 rounded-lg p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <div className="bg-orange-500 rounded-full p-1">
            <TrendingDown className="w-3 h-3 text-white" />
          </div>
          <h4 className="font-bold text-orange-900 text-xs">📉 Peor Mes</h4>
        </div>
        <div className="text-xs text-orange-700 mb-1">{peor.mes} {peor.año}</div>
        <div className="text-lg font-bold text-orange-900">
          {formatMoneda(peor.total)}
        </div>
        <div className="text-xs text-orange-600 mt-0.5">
          {peor.transacciones} operaciones
        </div>
      </div>
    </div>
  );
}

// Gráfico de Barras Horizontal Mejorado (ordenado de mayor a menor)
function GraficoBarras({ datos, titulo = "Tendencia", nombreMetrica = "Ventas" }) {
  if (!datos || datos.length === 0) return null;

  // ✅ Ordenar de mayor a menor por total
  const datosOrdenados = [...datos].sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(...datosOrdenados.map(d => d.total));
  const datosLimitados = datosOrdenados.slice(0, 10);

  return (
    <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100 h-full flex flex-col">
      <h3 className="text-lg font-bold text-gray-800 mb-4">📊 {nombreMetrica} por Periodo (Mayor a Menor)</h3>
      <div className="space-y-3 flex-1 overflow-y-auto">
        {datosLimitados.map((item, index) => {
          const porcentaje = (item.total / maxTotal) * 100;
          const esMaximo = item.total === maxTotal;
          
          return (
            <div key={index}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-gray-700 truncate max-w-[60%]">
                  {item.mes || item.Cliente}
                </span>
                <span className="text-sm font-bold text-gray-900">
                  {formatMoneda(item.total)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    esMaximo ? 'bg-gradient-to-r from-green-500 to-green-600' : 'bg-gradient-to-r from-blue-500 to-blue-600'
                  }`}
                  style={{ width: `${porcentaje}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Componente Principal
export default function VisualizacionEjecutiva({ metadata }) {
  if (!metadata) {
    console.log('⚠️ No hay metadata para visualización');
    return null;
  }

  const { 
    periodo_unico, 
    visualizaciones_recomendadas, 
    datos_para_graficos,
    titulos = {},  // ✅ Títulos dinámicos desde backend
    nombre_metrica = 'Ventas',  // ✅ Nombre de métrica dinámico
    periodo_analizado = ''
  } = metadata;

  console.log('🎨 Renderizando visualización ejecutiva:', {
    periodo_unico,
    cantidad_periodos: metadata.cantidad_periodos,
    tiene_meses: !!datos_para_graficos?.meses,
    periodo_analizado,
    titulos
  });

  // Para periodo único (sin comparativa)
  if (periodo_unico) {
    return (
      <div className="my-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          {titulos.resumen || `${nombre_metrica} - ${datos_para_graficos.periodo}`}
        </h2>
        <TarjetaKPI 
          titulo="Total"
          valor={formatMoneda(datos_para_graficos.total_ventas)}
          color="blue"
          icono="💰"
        />
      </div>
    );
  }

  // Para múltiples periodos (diseño ejecutivo completo)
  console.log('🔍 VisualizacionEjecutiva - Verificando datos para visualizaciones:', {
    tiene_datos_para_graficos: !!datos_para_graficos,
    tiene_meses: !!datos_para_graficos?.meses,
    cantidad_meses: datos_para_graficos?.meses?.length,
    estructura_completa: datos_para_graficos,
    contexto: metadata.contexto
  });

  // Detectar si hay serie temporal disponible para graficar
  const haySerieTemporal = Array.isArray(datos_para_graficos?.meses) && datos_para_graficos.meses.length > 0;

  // Totales básicos para decidir si mostramos KPIs
  const totalParaDecision = datos_para_graficos?.total_acumulado || datos_para_graficos?.total_ventas_real || datos_para_graficos?.total || 0;
  const promedioParaDecision = datos_para_graficos?.promedio_mensual || datos_para_graficos?.promedio || 0;

  // Mostrar visualizaciones solo si hay datos (serie o KPIs con valor)
  const puedeMostrarKPIs = haySerieTemporal || (Number(totalParaDecision) > 0 || Number(promedioParaDecision) > 0);

  return (
    <div className="my-4 space-y-4">
      {/* Título Principal - Solo texto, sin tarjeta */}
      {periodo_analizado && (
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          {titulos.resumen || `${nombre_metrica} - ${periodo_analizado}`}
        </h2>
      )}

      {/* KPIs comparativo si hay datos por año */}
      {metadata.datos_para_graficos?.comparativo_mensual && metadata.datos_para_graficos?.totales_por_anio && (
        <KPIsComparativo 
          totales={metadata.datos_para_graficos.totales_por_anio}
          comp={metadata.datos_para_graficos.comparativo_mensual}
        />
      )}

      {/* KPIs Principales - Todas las tarjetas en una sola línea */}
      {puedeMostrarKPIs ? (
        <ResumenEjecutivo 
          datos={datos_para_graficos}
          mejor={datos_para_graficos?.mejor_mes}
          peor={datos_para_graficos?.peor_mes}
          contexto={metadata.contexto || 'periodos'}
        />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No hay datos suficientes para graficar este análisis. Si buscas una comparativa, especifica los periodos (por ejemplo: "ventas 2024 vs 2025") y, si aplica, el sector.
        </div>
      )}

      {/* Layout de 2 columnas: Izquierda = Análisis Mensual/Clientes, Derecha = Gráfico */}
      {/* SIEMPRE mostrar si hay datos (meses o clientes), independientemente del flag mostrar_tendencia_temporal */}
      {haySerieTemporal && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          {/* Análisis Mensual/Clientes con % de cambio - Misma altura que el gráfico */}
          <AnalisisMensual 
            datos={datos_para_graficos.meses}
            contexto={metadata.contexto || 'periodos'}
          />

          {/* Gráfico de Barras (valores absolutos, ORDENADO) - Siempre mostrar si hay datos */}
          <GraficoBarras 
            datos={datos_para_graficos.meses} 
            titulo={titulos.evolucion || titulos.grafico || "Rentabilidad por Periodo"}
            nombreMetrica={nombre_metrica}
          />
        </div>
      )}

      {/* Línea comparativa mensual */}
      {metadata.datos_para_graficos?.comparativo_mensual && (
        <LineChartComparativo comp={metadata.datos_para_graficos.comparativo_mensual} />
      )}

      {/* Comparativo mensual YYYY vs YYYY */}
      {metadata.datos_para_graficos?.comparativo_mensual && (
        <TarjetasComparativoMensual comp={metadata.datos_para_graficos.comparativo_mensual} />
      )}

      {/* Barras por totales (Mayor a Menor) */}
      {metadata.datos_para_graficos?.totales_por_anio && (() => {
        const t = metadata.datos_para_graficos.totales_por_anio;
        const comp = metadata.datos_para_graficos.comparativo_mensual;
        if (!comp) return null;
        const datosTotales = [
          { mes: String(comp.anio_base), año: comp.anio_base, total: Number(t[comp.anio_base] || 0) },
          { mes: String(comp.anio_comp), año: comp.anio_comp, total: Number(t[comp.anio_comp] || 0) }
        ];
        return (
          <GraficoBarras datos={datosTotales} titulo="Ventas por Periodo (Mayor a Menor)" nombreMetrica={nombre_metrica} />
        );
      })()}

      {/* Comparativo mensual YYYY vs YYYY */}
      
    </div>
  );
}

