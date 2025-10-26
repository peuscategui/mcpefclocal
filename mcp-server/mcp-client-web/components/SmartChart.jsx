// components/SmartChart.jsx
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

const SmartChart = ({ response, query }) => {
  // Función para detectar si necesita gráfico
  const shouldShowChart = (response, query) => {
    const queryLower = query.toLowerCase();
    const responseText = response.content || '';
    
    // Palabras clave que indican necesidad de gráfico
    const chartKeywords = [
      'tendencia', 'evolución', 'comparar', 'vs', 'gráfico', 'chart',
      'mensual', 'anual', 'por mes', 'por año', 'crecimiento',
      'análisis temporal', 'distribución', 'ranking'
    ];
    
    // Detectar si la consulta contiene palabras clave
    const hasChartKeywords = chartKeywords.some(keyword => 
      queryLower.includes(keyword)
    );
    
    // Detectar si la respuesta contiene datos numéricos estructurados
    const hasStructuredData = responseText.includes('Métricas Clave') || 
                             responseText.includes('Análisis Mensual') ||
                             responseText.includes('Total') ||
                             responseText.includes('S/');
    
    return hasChartKeywords || hasStructuredData;
  };

  // Función para extraer datos del texto de respuesta
  const extractChartData = (responseText) => {
    const lines = responseText.split('\n');
    const chartData = {
      labels: [],
      datasets: [{
        label: 'Ventas',
        data: [],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.1
      }]
    };

    // Buscar datos mensuales
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    
    lines.forEach(line => {
      months.forEach(month => {
        if (line.toLowerCase().includes(month)) {
          // Extraer valor numérico
          const valueMatch = line.match(/S\/\s*([\d,]+\.?\d*)/);
          if (valueMatch) {
            const value = parseFloat(valueMatch[1].replace(/,/g, ''));
            chartData.labels.push(month.charAt(0).toUpperCase() + month.slice(1));
            chartData.datasets[0].data.push(value);
          }
        }
      });
    });

    return chartData;
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
    return data.labels.length > 3 ? 'line' : 'bar';
  };

  if (!shouldShowChart(response, query)) {
    return null;
  }

  const chartData = extractChartData(response.content);
  
  if (chartData.labels.length === 0) {
    return null;
  }

  const chartType = getChartType(query, chartData);
  
  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Análisis de Datos',
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
    <div className="mt-6 p-4 bg-white rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-4">📊 Visualización de Datos</h3>
      <div className="h-64">
        {chartType === 'line' ? (
          <Line data={chartData} options={options} />
        ) : (
          <Bar data={chartData} options={options} />
        )}
      </div>
    </div>
  );
};

export default SmartChart;

