import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, BarChart3 } from 'lucide-react';

// Función helper para formatear moneda
function formatMoneda(valor) {
  if (!valor) return 'S/ 0.00';
  return `S/ ${Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

// Componente para métrica simple
function MetricaSimple({ label, valor, icono }) {
  return (
    <div className="bg-white rounded-lg p-4 border border-gray-200">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icono}</span>
        <span className="text-sm text-gray-600 font-medium">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900">{valor}</div>
    </div>
  );
}

// Componente para tarjeta de mejor mes
function TarjetaMejorMes({ data }) {
  if (!data) return null;
  
  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-green-500 rounded-full p-2">
          <TrendingUp className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-lg text-green-900">🏆 Mejor Mes</h3>
          <p className="text-sm text-green-700">{data.mes} {data.año}</p>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-green-700">Ventas:</span>
          <span className="font-bold text-green-900">{formatMoneda(data.total)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-green-700">Transacciones:</span>
          <span className="font-semibold text-green-900">{data.transacciones?.toLocaleString('es-PE')}</span>
        </div>
      </div>
    </div>
  );
}

// Componente para tarjeta de peor mes
function TarjetaPeorMes({ data }) {
  if (!data) return null;
  
  return (
    <div className="bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-200 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-orange-500 rounded-full p-2">
          <TrendingDown className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-lg text-orange-900">📉 Mes Más Bajo</h3>
          <p className="text-sm text-orange-700">{data.mes} {data.año}</p>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-orange-700">Ventas:</span>
          <span className="font-bold text-orange-900">{formatMoneda(data.total)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-orange-700">Transacciones:</span>
          <span className="font-semibold text-orange-900">{data.transacciones?.toLocaleString('es-PE')}</span>
        </div>
      </div>
    </div>
  );
}

// Componente para gráfico de tendencia (simplificado)
function GraficoTendencia({ datos }) {
  if (!datos || datos.length === 0) return null;
  
  // Calcular el máximo para escalar las barras
  const maxTotal = Math.max(...datos.map(d => d.total));
  
  return (
    <div className="bg-white rounded-lg p-6 border border-gray-200 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-lg">Tendencia de Ventas</h3>
      </div>
      
      <div className="space-y-3">
        {datos.map((mes, index) => {
          const porcentaje = (mes.total / maxTotal) * 100;
          const esMaximo = mes.total === maxTotal;
          
          return (
            <div key={index} className="space-y-1">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-gray-700">
                  {mes.mes} {mes.año}
                </span>
                <span className="font-bold text-gray-900">
                  {formatMoneda(mes.total)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    esMaximo ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${porcentaje}%` }}
                />
              </div>
              <div className="text-xs text-gray-500">
                {mes.transacciones?.toLocaleString('es-PE')} transacciones
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Componente principal: Visualización Adaptativa
export default function VisualizacionAdaptativa({ metadata }) {
  if (!metadata) {
    console.log('⚠️ No hay metadata de visualización disponible');
    return null;
  }
  
  const { periodo_unico, visualizaciones_recomendadas, datos_para_graficos } = metadata;
  
  console.log('🎨 Renderizando visualización adaptativa:', {
    periodo_unico,
    visualizaciones_activas: Object.keys(visualizaciones_recomendadas).filter(
      k => visualizaciones_recomendadas[k]
    )
  });
  
  // Layout para periodo único
  if (periodo_unico) {
    return (
      <div className="my-6">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-4xl">📊</span>
            <div>
              <h3 className="font-bold text-xl text-blue-900">
                Análisis de {datos_para_graficos.periodo}
              </h3>
              <p className="text-sm text-blue-700">
                Datos de un solo periodo
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <MetricaSimple
              label="Total Ventas"
              valor={formatMoneda(datos_para_graficos.total_ventas)}
              icono="💰"
            />
            <MetricaSimple
              label="Transacciones"
              valor={datos_para_graficos.transacciones?.toLocaleString('es-PE') || '0'}
              icono="📈"
            />
            <MetricaSimple
              label="Promedio"
              valor={formatMoneda(datos_para_graficos.promedio)}
              icono="📊"
            />
          </div>
          
          <div className="mt-4 p-4 bg-white rounded-lg border border-blue-200">
            <div className="flex items-start gap-2">
              <span className="text-blue-500 text-xl">ℹ️</span>
              <p className="text-sm text-gray-700">
                <strong>Nota:</strong> Para ver comparativas de Mejor/Peor Mes y tendencias, 
                se necesitan datos de múltiples periodos. Prueba preguntando por 
                "últimos 3 meses" o "comparativo 2024 vs 2025".
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Layout para múltiples periodos
  return (
    <div className="my-6 space-y-6">
      {/* Resumen ejecutivo */}
      {datos_para_graficos.total_acumulado && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-6">
          <h3 className="font-bold text-xl text-purple-900 mb-4">
            📊 Resumen Ejecutivo
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricaSimple
              label="Total Acumulado"
              valor={formatMoneda(datos_para_graficos.total_acumulado)}
              icono="💰"
            />
            <MetricaSimple
              label="Promedio Mensual"
              valor={formatMoneda(datos_para_graficos.promedio_mensual)}
              icono="📊"
            />
            <MetricaSimple
              label="Total Transacciones"
              valor={datos_para_graficos.total_transacciones?.toLocaleString('es-PE') || '0'}
              icono="🛒"
            />
          </div>
        </div>
      )}
      
      {/* Tarjetas de Mejor/Peor Mes */}
      {visualizaciones_recomendadas.mostrar_mejor_peor_mes && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TarjetaMejorMes data={datos_para_graficos.mejor_mes} />
          <TarjetaPeorMes data={datos_para_graficos.peor_mes} />
        </div>
      )}
      
      {/* Gráfico de tendencia */}
      {visualizaciones_recomendadas.mostrar_tendencia_temporal && datos_para_graficos.meses && (
        <GraficoTendencia datos={datos_para_graficos.meses} />
      )}
      
      {/* Mensaje si no hay suficientes datos para tendencias */}
      {!visualizaciones_recomendadas.mostrar_tendencia_temporal && 
       visualizaciones_recomendadas.mostrar_comparativa && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <span className="text-yellow-600 text-xl">⚠️</span>
            <p className="text-sm text-gray-700">
              <strong>Datos limitados:</strong> Se necesitan al menos 3 meses para mostrar 
              gráficos de tendencia temporal.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

