// components/DataTable.jsx
import React, { useState } from 'react';
import { Database, Clock, BarChart3, TrendingUp, Download, Filter, RefreshCw, Calendar, DollarSign, Users, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';

export default function DataTable({ data, title = "Datos Detallados", defaultCollapsed = true }) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

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

  // ✅ NUEVO: Filtrar columnas no deseadas (TotalCosto)
  const allHeaders = Object.keys(data.data[0]);
  const headers = allHeaders.filter(h => !h.toLowerCase().includes('totalcosto') && !h.toLowerCase().includes('costo'));
  const rows = data.data;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-[#e9ecef] overflow-hidden">
      {/* Header Ejecutivo con botón de colapsar */}
      <div className="bg-gradient-to-r from-[#2F4050] to-[#4a5568] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              {isCollapsed ? (
                <Eye className="w-6 h-6 text-white" />
              ) : (
                <EyeOff className="w-6 h-6 text-white" />
              )}
            </button>
            <div>
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="text-sm text-white/80">
                {isCollapsed ? `${rows.length} registros - Click para ver detalle` : 'Análisis detallado de datos comerciales'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Acciones */}
            {!isCollapsed && (
              <div className="flex items-center space-x-2">
                <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                  <RefreshCw className="w-4 h-4 text-white" />
                </button>
                <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                  <Download className="w-4 h-4 text-white" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabla Ejecutiva (COLAPSABLE) */}
      {!isCollapsed && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#f8f9fc]">
                <tr>
                  {headers.map((header, index) => {
                    const isNumeric = isNumericColumn(header);
                    // Debug: Log para ver qué columnas se detectan como numéricas
                    if (index === 0) {
                      console.log('🔍 DataTable - Columnas detectadas:', {
                        headers: headers,
                        primeraColumna: { header, isNumeric }
                      });
                    }
                    return (
                      <th 
                        key={index}
                        className={`px-6 py-4 text-xs font-semibold text-[#2F4050] uppercase tracking-wider border-b border-[#e9ecef] ${
                          isNumeric ? 'text-right' : 'text-left'
                        }`}
                      >
                        <div className={`flex items-center space-x-2 ${isNumeric ? 'justify-end' : 'justify-start'}`}>
                          {!isNumeric && getHeaderIcon(header)}
                          <span>
                            {header.includes('$') ? 'Ventas' : formatHeaderName(header)}
                          </span>
                          {isNumeric && getHeaderIcon(header)}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9ecef]">
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-[#f8f9fc] transition-colors duration-150">
                    {headers.map((header, colIndex) => {
                      const isNumeric = isNumericColumn(header);
                      return (
                        <td 
                          key={colIndex}
                          className={`px-6 py-4 text-sm ${isNumeric ? 'text-right' : 'text-left'}`}
                        >
                          {formatCellValue(row[header], header, rowIndex)}
                        </td>
                      );
                    })}
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
        </>
      )}
    </div>
  );
}

// ✅ NUEVO: Detectar si una columna es numérica (para alinear a la derecha)
function isNumericColumn(header) {
  const headerLower = header.toLowerCase().trim();
  
  // Columnas de texto que SIEMPRE van a la izquierda (exact match o contains)
  const textOnlyColumns = [
    'cliente', 
    'codigo cliente', 
    'sector', 
    'nombremes', 
    'nombre mes'
  ];
  
  // Verificar primero si es texto puro (evitar confusión)
  for (const textCol of textOnlyColumns) {
    if (headerLower === textCol || (headerLower.includes(textCol) && !headerLower.includes('numero') && !headerLower.includes('num operaciones'))) {
      return false;
    }
  }
  
  // Columnas numéricas que SIEMPRE van a la derecha
  const numericColumns = [
    'venta', 'ventas',
    'totalventa', 'total venta', 'total ventas',
    'monto',
    'promedio', 'avg', 
    'transaccion', 'count', 
    'operaciones', 'numoperaciones', 'numero operaciones', 'num operaciones',
    'rentabilidad',
    'cantidad', 'numero',
    'markup',
    'margenpct', 'margen', 'margen%',
    'año', 'mes' // Cuando son números (no texto)
  ];
  
  // Si contiene alguna palabra numérica, es numérica
  for (const keyword of numericColumns) {
    if (headerLower.includes(keyword)) {
      // Excepciones: si es claramente texto (NombreMes, Cliente, etc.)
      if (headerLower.includes('nombremes') || headerLower.includes('nombre mes') || 
          (headerLower.includes('cliente') && !headerLower.includes('numero') && !headerLower.includes('num operaciones'))) {
        continue;
      }
      return true;
    }
  }
  
  // Por defecto, si no coincide con nada, asumir texto (izquierda)
  return false;
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

// Función para formatear nombres de headers (MEJORADA con correcciones específicas)
function formatHeaderName(header) {
  // SOLUCIÓN DIRECTA: Si contiene $ o VENTAS, devolver solo "Ventas"
  if (header.includes('$') || header.toLowerCase().includes('ventas')) {
    return 'Ventas';
  }
  
  // ✅ NUEVO: Casos específicos de formato ejecutivo
  const corrections = {
    'mesnumero': 'Mes',
    'transacciones': 'Transacciones',
    'promedioventa': 'Promedio de Venta',
    'totalventa': 'Total Ventas',
    'numoperaciones': 'Nº Operaciones',  // ✅ CORREGIDO
    'rentabilidad': 'Rentabilidad',
    'sector': 'Sector',
    'cliente': 'Cliente',
    'año': 'Año'
  };
  
  const headerLower = header.toLowerCase();
  for (const [key, value] of Object.entries(corrections)) {
    if (headerLower.includes(key)) {
      return value;
    }
  }
  
  // Limpiar cualquier símbolo de moneda del header
  const cleanHeader = header.replace(/[$]/g, '').trim();
  return cleanHeader.charAt(0).toUpperCase() + cleanHeader.slice(1);
}

// Función para formatear valores de celdas
function formatCellValue(value, header, rowIndex) {
  if (value === null || value === undefined) {
    return <span className="text-[#6c757d]">-</span>;
  }

  const headerLower = header.toLowerCase();

  // Formatear meses - CONVERSIÓN DE NÚMEROS A NOMBRES
  if (headerLower.includes('nombremes') || (headerLower.includes('mes') && headerLower.includes('nombre'))) {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    if (typeof value === 'number' && value >= 1 && value <= 12) {
      const nombreMes = meses[value - 1] || `Mes ${value}`;
      return <span className="text-[#2F4050]">{nombreMes}</span>;
    }
  }

  // Formatear números monetarios (TotalVenta, TotalVentas, Ventas) - 2 decimales
  if (headerLower.includes('venta') || headerLower.includes('totalventa')) {
    if (typeof value === 'number') {
      return (
        <span className="font-semibold text-[#2F4050]">
          S/ {value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      );
    }
  }

  // Formatear Rentabilidad - 2 decimales
  if (headerLower.includes('rentabilidad')) {
    if (typeof value === 'number') {
      return (
        <span className="font-semibold text-[#2F4050]">
          {value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      );
    }
  }

  // Formatear MargenPct - 2 decimales + símbolo %
  if (headerLower.includes('margenpct') || headerLower.includes('margen')) {
    if (typeof value === 'number') {
      return (
        <span className="font-semibold text-[#2F4050]">
          {value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
        </span>
      );
    }
  }

  // Formatear Markup - 2 decimales
  if (headerLower.includes('markup')) {
    if (typeof value === 'number') {
      return (
        <span className="font-medium text-[#2F4050]">
          {value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      );
    }
  }

  // Formatear números de transacciones/operaciones - enteros
  if (headerLower.includes('transaccion') || headerLower.includes('operaciones') || headerLower.includes('numoperaciones') || headerLower.includes('count')) {
    if (typeof value === 'number') {
      return (
        <span className="font-medium text-[#2F4050]">
          {value.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
        </span>
      );
    }
  }

  // Formatear números promedio
  if (headerLower.includes('promedio') || headerLower.includes('avg')) {
    if (typeof value === 'number') {
      return (
        <span className="font-medium text-[#2F4050]">
          S/ {value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      );
    }
  }

  // Formatear números generales
  if (typeof value === 'number') {
    return (
      <span className="font-medium text-[#2F4050]">
        {value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    );
  }

  // Formatear fechas
  if (headerLower.includes('fecha') || headerLower.includes('date')) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return <span className="text-[#2F4050]">{date.toLocaleDateString('es-PE')}</span>;
      }
    } catch (e) {
      // Si no es una fecha válida, mostrar como texto
    }
  }

  // Texto normal (Cliente, Código Cliente, Sector) - alineación izquierda
  return <span className="text-[#2F4050]">{String(value)}</span>;
}