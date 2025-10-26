// components/ComparativeTable.jsx
import React from 'react';
import { TrendingUp, TrendingDown, BarChart3, Calendar, Download, RefreshCw } from 'lucide-react';

export default function ComparativeTable({ data, title = "Comparativo Mensual" }) {
  if (!data || !data.data || data.data.length === 0) {
    return null;
  }

  // Verificar si es un comparativo (tiene columna Año)
  const esComparativo = data.data.some(item => item.Año !== undefined);
  
  if (!esComparativo) {
    return null; // No mostrar esta tabla si no es comparativo
  }

  // Agrupar datos por mes
  const datosPorMes = {};
  data.data.forEach(item => {
    const mes = item.Mes || `Mes ${item.MesNumero}`;
    const año = item.Año;
    
    if (!datosPorMes[mes]) {
      datosPorMes[mes] = { mes, mesNumero: item.MesNumero };
    }
    
    if (año === 2024) {
      datosPorMes[mes].ventas2024 = item.Ventas || 0;
      datosPorMes[mes].trans2024 = item.Transacciones || 0;
    } else if (año === 2025) {
      datosPorMes[mes].ventas2025 = item.Ventas || 0;
      datosPorMes[mes].trans2025 = item.Transacciones || 0;
    }
  });

  // Convertir a array y ordenar por mes
  const datosComparativos = Object.values(datosPorMes)
    .sort((a, b) => a.mesNumero - b.mesNumero)
    .map(item => ({
      ...item,
      cambio: item.ventas2024 > 0 
        ? ((item.ventas2025 - item.ventas2024) / item.ventas2024) * 100 
        : 0
    }));

  // Calcular totales
  const total2024 = datosComparativos.reduce((sum, item) => sum + (item.ventas2024 || 0), 0);
  const total2025 = datosComparativos.reduce((sum, item) => sum + (item.ventas2025 || 0), 0);
  const cambioTotal = total2024 > 0 ? ((total2025 - total2024) / total2024) * 100 : 0;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-[#e9ecef] overflow-hidden">
      {/* Header Ejecutivo */}
      <div className="bg-gradient-to-r from-[#2F4050] to-[#4a5568] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="text-sm text-white/80">Comparación detallada 2024 vs 2025</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Totales */}
            <div className="text-right">
              <div className="text-white/90 text-sm">
                <span className="font-semibold">2024:</span> S/ {(total2024 / 1000000).toFixed(1)}M
              </div>
              <div className="text-white/90 text-sm">
                <span className="font-semibold">2025:</span> S/ {(total2025 / 1000000).toFixed(1)}M
              </div>
            </div>

            {/* Acciones */}
            <div className="flex items-center space-x-2">
              <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                <RefreshCw className="w-4 h-4 text-white" />
              </button>
              <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                <Download className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla Comparativa con Scroll */}
      <div className="overflow-x-auto overflow-y-auto" style={{ minHeight: '300px', maxHeight: '600px' }}>
        <table className="w-full">
          <thead className="bg-[#f8f9fc] sticky top-0 z-10">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[#2F4050] uppercase tracking-wider border-b border-[#e9ecef]">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4" />
                  <span>Mes</span>
                </div>
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-[#3b82f6] uppercase tracking-wider border-b border-[#e9ecef]">
                Ventas 2024
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-[#10b981] uppercase tracking-wider border-b border-[#e9ecef]">
                Ventas 2025
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-[#2F4050] uppercase tracking-wider border-b border-[#e9ecef]">
                Cambio
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e9ecef]">
            {datosComparativos.map((row, index) => {
              const isPositive = row.cambio >= 0;
              const Icon = isPositive ? TrendingUp : TrendingDown;
              const colorClass = isPositive ? 'text-[#27ae60]' : 'text-[#e74c3c]';
              
              return (
                <tr key={index} className="hover:bg-[#f8f9fc] transition-colors duration-150">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-[#6c757d]" />
                      <span className="font-semibold text-[#2F4050]">{row.mes}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-semibold text-[#3b82f6]">
                      S/ {row.ventas2024 ? row.ventas2024.toLocaleString() : '-'}
                    </div>
                    {row.trans2024 && (
                      <div className="text-xs text-[#6c757d] mt-1">
                        {row.trans2024.toLocaleString()} transacciones
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-semibold text-[#10b981]">
                      S/ {row.ventas2025 ? row.ventas2025.toLocaleString() : '-'}
                    </div>
                    {row.trans2025 && (
                      <div className="text-xs text-[#6c757d] mt-1">
                        {row.trans2025.toLocaleString()} transacciones
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center space-x-2">
                      <Icon className={`w-4 h-4 ${colorClass}`} />
                      <span className={`font-bold ${colorClass}`}>
                        {isPositive ? '+' : ''}{row.cambio.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-[#f8f9fc] border-t-2 border-[#2F4050]">
            <tr>
              <td className="px-6 py-4 font-bold text-[#2F4050]">
                TOTAL
              </td>
              <td className="px-6 py-4 text-right font-bold text-[#3b82f6]">
                S/ {total2024.toLocaleString()}
              </td>
              <td className="px-6 py-4 text-right font-bold text-[#10b981]">
                S/ {total2025.toLocaleString()}
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center justify-center space-x-2">
                  {cambioTotal >= 0 ? (
                    <TrendingUp className="w-5 h-5 text-[#27ae60]" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-[#e74c3c]" />
                  )}
                  <span className={`font-bold text-lg ${cambioTotal >= 0 ? 'text-[#27ae60]' : 'text-[#e74c3c]'}`}>
                    {cambioTotal >= 0 ? '+' : ''}{cambioTotal.toFixed(1)}%
                  </span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

