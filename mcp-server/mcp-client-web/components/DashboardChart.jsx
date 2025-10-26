// components/DashboardChart.jsx
import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
} from 'chart.js';
import { Line, Bar, Pie } from 'react-chartjs-2';
import { 
  TrendingUp, 
  BarChart3, 
  PieChart, 
  Activity,
  Calendar,
  Clock,
  Filter,
  Download,
  RefreshCw,
  Maximize2,
  Settings,
  DollarSign,
  Target
} from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

const DashboardChart = ({ response, query }) => {
  // Función para detectar si necesita gráfico
  const shouldShowChart = (response, query) => {
    const queryLower = query.toLowerCase();
    
    // ✅ PRIORIDAD 1: Si NO hay dataPreview con datos numéricos, NO mostrar gráfico
    if (!response.dataPreview || !response.dataPreview.data || response.dataPreview.data.length === 0) {
      console.log('❌ No hay dataPreview, no mostrar gráfico');
      return false;
    }
    
    // ✅ PRIORIDAD 2: Verificar que los datos tengan columnas numéricas visualizables
    const firstRow = response.dataPreview.data[0];
    const hasNumericData = firstRow && (
      firstRow.Ventas !== undefined || 
      firstRow.Total !== undefined || 
      firstRow.Monto !== undefined ||
      firstRow.Cantidad !== undefined
    );
    
    if (!hasNumericData) {
      console.log('❌ No hay datos numéricos, no mostrar gráfico');
      return false;
    }
    
    // ✅ PRIORIDAD 3: Palabras clave que indican análisis temporal/cuantitativo
    const chartKeywords = [
      'tendencia', 'evolución', 'comparar', 'vs', 'comparativo',
      'mensual', 'anual', 'por mes', 'por año', 'cada mes',
      'análisis temporal', 'crecimiento', '2024', '2025'
    ];
    
    const hasChartKeywords = chartKeywords.some(keyword => 
      queryLower.includes(keyword)
    );
    
    console.log('🔍 shouldShowChart:', {
      hasDataPreview: !!response.dataPreview,
      hasNumericData,
      hasChartKeywords,
      result: hasNumericData && hasChartKeywords
    });
    
    return hasNumericData && hasChartKeywords;
  };

  // Función para extraer datos del backend
  const extractDataFromBackend = (response) => {
    // Si hay dataPreview del backend, usarlo directamente
    if (response.dataPreview && response.dataPreview.data) {
      console.log('📊 Usando dataPreview:', response.dataPreview.data);
      return response.dataPreview.data;
    }
    
    // Si hay rawData, extraer de ahí
    if (response.rawData && response.rawData.content) {
      try {
        const parsed = JSON.parse(response.rawData.content[0].text);
        console.log('📊 Datos parseados de rawData:', parsed);
        return parsed.data || [];
      } catch (e) {
        console.error('❌ Error parseando rawData:', e);
        return [];
      }
    }
    
    console.log('⚠️ No se encontraron datos en el backend');
    return [];
  };

  // Función para extraer datos del texto de respuesta
  const extractDataFromText = (responseText) => {
    const lines = responseText.split('\n');
    const data = [];
    
    // Buscar datos mensuales en el texto
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    
    lines.forEach(line => {
      months.forEach(month => {
        if (line.toLowerCase().includes(month)) {
          // Extraer valor numérico
          const valueMatch = line.match(/S\/\s*([\d,]+\.?\d*)/);
          if (valueMatch) {
            const value = parseFloat(valueMatch[1].replace(/,/g, ''));
            data.push({
              month: month.charAt(0).toUpperCase() + month.slice(1),
              value: value
            });
          }
        }
      });
    });
    
    return data;
  };

  // Función para crear datos del gráfico
  const createChartData = (data, query) => {
    if (!data || data.length === 0) {
      console.log('⚠️ No hay datos para crear el gráfico');
      return null;
    }
    
    console.log('📊 Creando datos del gráfico con:', data);
    
    // Detectar si es un comparativo (tiene columna "Año")
    const esComparativo = data.some(item => item.Año !== undefined);
    
    if (esComparativo) {
      console.log('📊 Detectado comparativo entre años');
      
      // Separar datos por año
      const datos2024 = data.filter(d => d.Año === 2024);
      const datos2025 = data.filter(d => d.Año === 2025);
      
      // Obtener lista única de meses
      const mesesUnicos = [...new Set(data.map(d => d.MesNumero))].sort((a, b) => a - b);
      const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                           'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const labels = mesesUnicos.map(m => mesesNombres[m - 1]);
      
      // Crear datasets para cada año
      const valores2024 = mesesUnicos.map(mesNum => {
        const dato = datos2024.find(d => d.MesNumero === mesNum);
        return dato ? dato.Ventas : null;
      });
      
      const valores2025 = mesesUnicos.map(mesNum => {
        const dato = datos2025.find(d => d.MesNumero === mesNum);
        return dato ? dato.Ventas : null;
      });
      
      return {
        labels: labels,
        datasets: [
          {
            label: '2024',
            data: valores2024,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            pointBackgroundColor: '#3b82f6',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8,
            tension: 0.4,
            fill: false,
            borderWidth: 3
          },
          {
            label: '2025',
            data: valores2025,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8,
            tension: 0.4,
            fill: false,
            borderWidth: 3
          }
        ]
      };
    }
    
    // Modo normal (un solo año) - VERSIÓN CORREGIDA
    const labels = data.map((item, index) => {
      // Verificar si el campo Mes existe y es string
      if (item.Mes && typeof item.Mes === 'string' && item.Mes !== '') {
        return item.Mes;
      }
      
      // Verificar si MesNumero existe y es número
      if (item.MesNumero && typeof item.MesNumero === 'number') {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return meses[item.MesNumero - 1] || `Mes ${item.MesNumero}`;
      }
      
      // Otros casos
      if (item.Dia) return `Día ${item.Dia}`;
      return `Punto ${index + 1}`;
    });
    
    const values = data.map(item => {
      return item.Ventas || item.venta || item.value || item.total || 0;
    });
    
    return {
      labels: labels,
      datasets: [{
        label: 'Ventas',
        data: values,
        borderColor: '#2F4050',
        backgroundColor: 'rgba(47, 64, 80, 0.1)',
        pointBackgroundColor: '#2F4050',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        tension: 0.4,
        fill: true,
        borderWidth: 3
      }]
    };
  };

  // Función para determinar el tipo de gráfico
  const getChartType = (query, data) => {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('tendencia') || queryLower.includes('evolución') || queryLower.includes('temporal')) {
      return 'line';
    }
    
    if (queryLower.includes('comparar') || queryLower.includes('vs') || queryLower.includes('distribución')) {
      return 'bar';
    }
    
    if (queryLower.includes('ranking') || queryLower.includes('porcentaje')) {
      return 'pie';
    }
    
    // Por defecto, usar línea para datos temporales
    return data.length > 3 ? 'line' : 'bar';
  };

  // Función para obtener el icono según el tipo de gráfico
  const getChartIcon = (chartType) => {
    switch (chartType) {
      case 'line':
        return <TrendingUp className="w-6 h-6 text-white" />;
      case 'bar':
        return <BarChart3 className="w-6 h-6 text-white" />;
      case 'pie':
        return <PieChart className="w-6 h-6 text-white" />;
      default:
        return <Activity className="w-6 h-6 text-white" />;
    }
  };

  // Función para calcular estadísticas
  const calculateStats = (data) => {
    if (!data || data.length === 0) return null;
    
    const values = data.map(item => item.Ventas || item.venta || item.value || item.total || 0);
    const total = values.reduce((sum, val) => sum + val, 0);
    const promedio = total / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const crecimiento = values.length > 1 ? ((values[values.length - 1] - values[0]) / values[0] * 100) : 0;
    
    return { total, promedio, max, min, crecimiento };
  };

  if (!shouldShowChart(response, query)) {
    return null;
  }

  // Intentar extraer datos del backend primero
  let rawData = extractDataFromBackend(response);
  
  // Si no hay datos del backend, extraer del texto
  if (!rawData || rawData.length === 0) {
    rawData = extractDataFromText(response.content);
  }
  
  if (!rawData || rawData.length === 0) {
    console.log('⚠️ No hay datos para mostrar en el gráfico');
    return (
      <div className="bg-white rounded-xl shadow-lg border border-[#e9ecef] overflow-hidden">
        <div className="bg-gradient-to-r from-[#2F4050] to-[#4a5568] px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Dashboard de Análisis</h3>
              <p className="text-sm text-white/80">No hay datos suficientes para generar el gráfico</p>
            </div>
          </div>
        </div>
        
        <div className="p-8 text-center text-[#6c757d]">
          <Target className="w-12 h-12 mx-auto mb-4 text-[#6c757d]/50" />
          <p className="text-lg font-medium mb-2">Sin datos disponibles</p>
          <p className="text-sm">Los datos obtenidos no contienen información suficiente para visualización.</p>
          <p className="text-xs mt-2 text-[#6c757d]">Intenta con una consulta más específica.</p>
        </div>
      </div>
    );
  }

  const chartData = createChartData(rawData, query);
  
  if (!chartData) {
    return null;
  }

  const chartType = getChartType(query, rawData);
  const stats = calculateStats(rawData);
  
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index'
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(47, 64, 80, 0.95)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          title: function(context) {
            return context[0].label;
          },
          label: function(context) {
            return 'S/ ' + context.parsed.y.toLocaleString();
          }
        }
      }
    },
    scales: chartType !== 'pie' ? {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
          drawBorder: false
        },
        ticks: {
          color: '#6c757d',
          font: {
            size: 12
          },
          callback: function(value) {
            return 'S/ ' + (value / 1000000).toFixed(1) + 'M';
          }
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: '#6c757d',
          font: {
            size: 12
          }
        }
      }
    } : {}
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-[#e9ecef] overflow-hidden">
      {/* Header Ejecutivo del Dashboard */}
      <div className="bg-gradient-to-r from-[#2F4050] to-[#4a5568] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-lg">
              {getChartIcon(chartType)}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Dashboard de Análisis Comercial
              </h3>
              <p className="text-sm text-white/80">
                Visualización inteligente de datos comerciales
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4 text-white" />
            </button>
            <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
              <Maximize2 className="w-4 h-4 text-white" />
            </button>
            <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
              <Download className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Estadísticas Rápidas */}
      {stats && (
        <div className="bg-[#f8f9fc] px-6 py-4 border-b border-[#e9ecef]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1 mb-1">
                <DollarSign className="w-4 h-4 text-[#27ae60]" />
                <span className="text-xs font-medium text-[#6c757d]">TOTAL</span>
              </div>
              <div className="text-lg font-bold text-[#2F4050]">
                S/ {(stats.total / 1000000).toFixed(1)}M
              </div>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1 mb-1">
                <TrendingUp className="w-4 h-4 text-[#2F4050]" />
                <span className="text-xs font-medium text-[#6c757d]">PROMEDIO</span>
              </div>
              <div className="text-lg font-bold text-[#2F4050]">
                S/ {(stats.promedio / 1000000).toFixed(1)}M
              </div>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1 mb-1">
                <Target className="w-4 h-4 text-[#f39c12]" />
                <span className="text-xs font-medium text-[#6c757d]">MÁXIMO</span>
              </div>
              <div className="text-lg font-bold text-[#2F4050]">
                S/ {(stats.max / 1000000).toFixed(1)}M
              </div>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1 mb-1">
                <BarChart3 className="w-4 h-4 text-[#e74c3c]" />
                <span className="text-xs font-medium text-[#6c757d]">CRECIMIENTO</span>
              </div>
              <div className={`text-lg font-bold ${stats.crecimiento >= 0 ? 'text-[#27ae60]' : 'text-[#e74c3c]'}`}>
                {stats.crecimiento >= 0 ? '+' : ''}{stats.crecimiento.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Gráfico */}
      <div className="p-6">
        <div style={{ height: '400px' }} className="mb-4">
          {chartType === 'line' ? (
            <Line data={chartData} options={options} />
          ) : chartType === 'bar' ? (
            <Bar data={chartData} options={options} />
          ) : (
            <Pie data={chartData} options={options} />
          )}
        </div>
      </div>
      
      {/* Footer Ejecutivo */}
      <div className="bg-[#f8f9fc] px-6 py-4 border-t border-[#e9ecef]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 text-sm text-[#6c757d]">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>{rawData.length} puntos de datos</span>
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4" />
              <span>Tipo: {chartType === 'line' ? 'Tendencia Temporal' : chartType === 'bar' ? 'Análisis Comparativo' : 'Distribución'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4" />
              <span>Actualizado: {new Date().toLocaleTimeString('es-PE')}</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button className="px-3 py-1 text-xs font-medium text-[#2F4050] bg-white border border-[#e9ecef] rounded-md hover:bg-gray-50 transition-colors">
              Exportar PNG
            </button>
            <button className="px-3 py-1 text-xs font-medium text-white bg-[#2F4050] rounded-md hover:bg-[#2F4050]/90 transition-colors">
              Configurar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardChart;