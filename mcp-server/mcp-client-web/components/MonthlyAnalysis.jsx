// components/MonthlyAnalysis.jsx
import React from 'react';
import { TrendingUp, TrendingDown, Calendar } from 'lucide-react';

export default function MonthlyAnalysis({ response, query }) {
  // Solo mostrar para comparativos
  const esComparativo = query.toLowerCase().includes('comparativo') || 
                       query.toLowerCase().includes('comparar') || 
                       query.toLowerCase().includes('vs');
  
  if (!esComparativo || !response.dataPreview || !response.dataPreview.data) {
    return null;
  }

  const data = response.dataPreview.data;
  
  // Verificar que tenga columna "Año"
  if (!data.some(item => item.Año !== undefined)) {
    return null;
  }

  // Separar datos por año
  const datos2024 = data.filter(d => d.Año === 2024);
  const datos2025 = data.filter(d => d.Año === 2025);

  // Calcular cambios mensuales
  const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  
  const cambiosMensuales = [];
  
  datos2024.forEach(dato2024 => {
    const mesNumero = dato2024.MesNumero;
    const dato2025 = datos2025.find(d => d.MesNumero === mesNumero);
    
    if (dato2025) {
      const ventas2024 = dato2024.Ventas || 0;
      const ventas2025 = dato2025.Ventas || 0;
      const cambio = ventas2024 > 0 ? ((ventas2025 - ventas2024) / ventas2024) * 100 : 0;
      
      cambiosMensuales.push({
        mes: mesesNombres[mesNumero - 1],
        cambio: cambio
      });
    }
  });

  if (cambiosMensuales.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-[#e9ecef] p-6">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-gradient-to-r from-[#2F4050] to-[#4a5568] rounded-lg">
          <Calendar className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[#2F4050]">Análisis Mensual</h3>
          <p className="text-sm text-[#6c757d]">Comparación mes a mes 2024 vs 2025</p>
        </div>
      </div>

      {/* Grid de meses */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cambiosMensuales.map((item, index) => {
          const isPositive = item.cambio >= 0;
          const Icon = isPositive ? TrendingUp : TrendingDown;
          const colorClass = isPositive ? 'text-[#27ae60]' : 'text-[#e74c3c]';
          const bgClass = isPositive ? 'bg-green-50' : 'bg-red-50';
          const borderClass = isPositive ? 'border-[#27ae60]' : 'border-[#e74c3c]';
          
          return (
            <div 
              key={index}
              className={`${bgClass} border-l-4 ${borderClass} rounded-lg p-4 transition-all hover:shadow-md`}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm font-medium text-[#2F4050]">{item.mes}</span>
                <Icon className={`w-4 h-4 ${colorClass}`} />
              </div>
              <div className={`text-xl font-bold ${colorClass}`}>
                {isPositive ? '+' : ''}{item.cambio.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer con resumen */}
      <div className="mt-6 pt-4 border-t border-[#e9ecef]">
        <div className="flex items-center justify-between text-sm text-[#6c757d]">
          <span>
            Meses con crecimiento: {cambiosMensuales.filter(m => m.cambio >= 0).length} de {cambiosMensuales.length}
          </span>
          <span>
            Cambio promedio: {(cambiosMensuales.reduce((sum, m) => sum + m.cambio, 0) / cambiosMensuales.length).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}


