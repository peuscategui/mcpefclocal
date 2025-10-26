// components/DataVisualization.jsx
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
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const DataVisualization = ({ response, query }) => {
  // Función para detectar si necesita gráfico
  const shouldShowChart = (response, query) => {
    const queryLower = query.toLowerCase();
    
    // Palabras clave que indican necesidad de gráfico
    const chartKeywords = [
      'tendencia', 'evolución', 'comparar', 'vs', 'gráfico', 'chart',
      'mensual', 'anual', 'por mes', 'por año', 'crecimiento',
      'análisis temporal', 'distribución', 'ranking', 'ventas'
    ];
    
    // Detectar si la consulta contiene palabras clave
    const hasChartKeywords = chartKeywords.some(keyword => 
      queryLower.includes(keyword)
    );
    
    // Detectar si hay datos estructurados en la respuesta
    const hasStructuredData = response.dataPreview || 
                             (response.rawData && response.rawData.content);
    
    return hasChartKeywords || hasStructuredData;
  };

  // Función para extraer datos del backend
  const extractDataFromBackend = (response) => {
    // Si hay dataPreview del backend, usarlo directamente
    if (response.dataPreview && response.dataPreview.data) {
      return response.dataPreview.data;
    }
    
    // Si hay rawData, extraer de ahí
    if (response.rawData && response.rawData.content) {
      try {
        const parsed = JSON.parse(response.rawData.content[0].text);
        return parsed.data || [];
      } catch (e) {
        return [];
      }
    }
    
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
  const createChartData = (data) => {
    if (!data || data.length === 0) return null;
    
    return {
      labels: data.map(item => item.month || item.Mes || item.fecha),
      datasets: [{
        label: 'Ventas',
        data: data.map(item => item.value || item.Ventas || item.venta),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.1
      }]
    };
  };

  // Función para determinar el tipo de gráfico
  const getChartType = (query, data) => {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('tendencia') || queryLower.includes('evolución')) {
      return 'line';
    }
    
    if (queryLower.includes('comparar') || queryLower.includes('vs')) {
      return 'bar';
    }
    
    // Por defecto, usar línea para datos temporales
    return data.length > 3 ? 'line' : 'bar';
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
    return null;
  }

  const chartData = createChartData(rawData);
  
  if (!chartData) {
    return null;
  }

  const chartType = getChartType(query, rawData);
  
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: '📊 Análisis Visual de Datos',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return 'S/ ' + value.toLocaleString();
          }
        }
      }
    }
  };

  return (
    <div className="mt-6 p-6 bg-white rounded-lg shadow-lg border">
      <div className="mb-4">
        <h3 className="text-xl font-semibold text-gray-800 mb-2">
          📊 Visualización de Datos
        </h3>
        <p className="text-sm text-gray-600">
          Gráfico generado automáticamente basado en tu consulta
        </p>
      </div>
      
      <div className="h-80">
        {chartType === 'line' ? (
          <Line data={chartData} options={options} />
        ) : (
          <Bar data={chartData} options={options} />
        )}
      </div>
      
      <div className="mt-4 text-xs text-gray-500">
        💡 Este gráfico se genera automáticamente para consultas de análisis de datos
      </div>
    </div>
  );
};

export default DataVisualization;

