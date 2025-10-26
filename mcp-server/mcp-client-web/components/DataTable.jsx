// components/DataTable.jsx
import React from 'react';
import { Database, Clock, BarChart3, TrendingUp, Download, Filter, RefreshCw, Calendar, DollarSign, Users } from 'lucide-react';

export default function DataTable({ data, title = "Datos Detallados" }) {
  if (!data || !data.data || data.data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-[#e9ecef] p-8">
        <div className="flex items-center justify-center space-x-3 text-[#6c757d] py-16">
          <BarChart3 className="w-8 h-8" />
          <div className="text-center">
            <h3 className="text-lg font-medium text-[#2F4050] mb-1">Sin datos disponibles</h3>
            <p className="text-secundario">No hay información para mostrar en este momento</p>
          </div>
        </div>
      </div>
    );
  }

  const headers = Object.keys(data.data[0]);
  const rows = data.data;

  // Calcular estadísticas rápidas
  const totalVentas = rows.reduce((sum, row) => {
    const ventas = row.Ventas || row.venta || row.total || 0;
    return sum + (typeof ventas === 'number' ? ventas : 0);
  }, 0);

  const promedioVentas = rows.length > 0 ? totalVentas / rows.length : 0;

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
              <p className="text-sm text-white/80">Análisis detallado de datos comerciales</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Estadísticas rápidas */}
            <div className="text-right whitespace-nowrap">
              <div className="text-white/90 mb-2">
                <span className="text-sm">Total: </span>
                <span className="font-semibold">S/ {totalVentas.toLocaleString()}</span>
              </div>
              <div className="text-white/90">
                <span className="text-sm">Promedio: </span>
                <span className="font-semibold">S/ {promedioVentas.toLocaleString()}</span>
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

      {/* Tabla Ejecutiva */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#f8f9fc]">
            <tr>
              {headers.map((header, index) => (
                <th 
                  key={index}
                  className="px-6 py-4 text-left text-xs font-semibold text-[#2F4050] uppercase tracking-wider border-b border-[#e9ecef]"
                >
                  <div className="flex items-center space-x-2">
                    {getHeaderIcon(header)}
                    <span>
                      {header.includes('$') ? 'Ventas' : formatHeaderName(header)}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e9ecef]">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-[#f8f9fc] transition-colors duration-150">
                {headers.map((header, colIndex) => (
                  <td 
                    key={colIndex}
                    className="px-6 py-4 text-sm"
                  >
                    {formatCellValue(row[header], header, rowIndex)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Ejecutivo */}
      <div className="bg-[#f8f9fc] px-6 py-4 border-t border-[#e9ecef]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 text-sm text-[#6c757d]">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>Última actualización: {new Date().toLocaleDateString('es-PE')}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4" />
              <span>{rows.length} registros mostrados</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button className="px-3 py-1 text-xs font-medium text-[#2F4050] bg-white border border-[#e9ecef] rounded-md hover:bg-gray-50 transition-colors">
              Exportar CSV
            </button>
            <button className="px-3 py-1 text-xs font-medium text-white bg-[#2F4050] rounded-md hover:bg-[#2F4050]/90 transition-colors">
              Generar Reporte
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Función para obtener iconos de headers - SIN ICONO DE DÓLAR
function getHeaderIcon(header) {
  const headerLower = header.toLowerCase();
  
  if (headerLower.includes('mes') || headerLower.includes('month')) {
    return <Calendar className="w-4 h-4 text-[#2F4050]" />;
  }
  // NO MOSTRAR ICONO DE DÓLAR EN EL HEADER - SOLO EN LOS VALORES
  if (headerLower.includes('venta') || headerLower.includes('total') || headerLower.includes('monto')) {
    return null; // Sin icono para evitar confusión con el símbolo $
  }
  if (headerLower.includes('transaccion') || headerLower.includes('count')) {
    return <Users className="w-4 h-4 text-[#f39c12]" />;
  }
  if (headerLower.includes('promedio') || headerLower.includes('avg')) {
    return <TrendingUp className="w-4 h-4 text-[#2F4050]" />;
  }
  
  return <BarChart3 className="w-4 h-4 text-[#6c757d]" />;
}

// Función para formatear nombres de headers - SOLUCIÓN DEFINITIVA
function formatHeaderName(header) {
  // SOLUCIÓN DIRECTA: Si contiene $ o VENTAS, devolver solo "Ventas"
  if (header.includes('$') || header.toLowerCase().includes('ventas')) {
    return 'Ventas';
  }
  
  // Otros casos específicos
  if (header.toLowerCase().includes('mesnumero')) return 'Mes';
  if (header.toLowerCase().includes('transacciones')) return 'Transacciones';
  if (header.toLowerCase().includes('promedioventa')) return 'Promedio';
  
  // Limpiar cualquier símbolo de moneda del header
  const cleanHeader = header.replace(/[$]/g, '').trim();
  return cleanHeader.charAt(0).toUpperCase() + cleanHeader.slice(1);
}

// Función para formatear valores de celdas
function formatCellValue(value, header, rowIndex) {
  if (value === null || value === undefined) {
    return <span className="text-[#6c757d]">-</span>;
  }

  // Formatear meses - CONVERSIÓN DE NÚMEROS A NOMBRES
  if (header.toLowerCase().includes('mes') && typeof value === 'number' && value >= 1 && value <= 12) {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nombreMes = meses[value - 1] || `Mes ${value}`;
    return (
      <div className="flex items-center space-x-2">
        <Calendar className="w-4 h-4 text-[#6c757d]" />
        <span className="font-semibold text-[#2F4050]">{nombreMes}</span>
      </div>
    );
  }

  // Formatear números monetarios - SIN ICONO DE DÓLAR
  if (header.toLowerCase().includes('venta') || header.toLowerCase().includes('total') || header.toLowerCase().includes('monto')) {
    if (typeof value === 'number') {
      return (
        <span className="font-semibold text-[#2F4050]">S/ {value.toLocaleString()}</span>
      );
    }
  }

  // Formatear números de transacciones
  if (header.toLowerCase().includes('transaccion') || header.toLowerCase().includes('count')) {
    if (typeof value === 'number') {
      return (
        <div className="flex items-center space-x-2">
          <Users className="w-4 h-4 text-[#f39c12]" />
          <span className="font-medium text-[#2F4050]">{value.toLocaleString()}</span>
        </div>
      );
    }
  }

  // Formatear números promedio
  if (header.toLowerCase().includes('promedio') || header.toLowerCase().includes('avg')) {
    if (typeof value === 'number') {
      return (
        <span className="font-medium text-[#2F4050]">S/ {value.toLocaleString()}</span>
      );
    }
  }

  // Formatear números generales
  if (typeof value === 'number') {
    return <span className="font-medium text-[#2F4050]">{value.toLocaleString()}</span>;
  }

  // Formatear fechas
  if (header.toLowerCase().includes('fecha') || header.toLowerCase().includes('date')) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return <span className="text-[#2F4050]">{date.toLocaleDateString('es-PE')}</span>;
      }
    } catch (e) {
      // Si no es una fecha válida, mostrar como texto
    }
  }

  // Texto normal
  return <span className="text-[#2F4050]">{String(value)}</span>;
}