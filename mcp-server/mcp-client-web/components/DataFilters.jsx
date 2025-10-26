// components/DataFilters.jsx
import React, { useState } from 'react';
import { 
  Filter, 
  Calendar, 
  ChevronDown,
  Clock,
  TrendingUp
} from 'lucide-react';

const DataFilters = ({ onFilterChange, currentQuery }) => {
  const [selectedPeriod, setSelectedPeriod] = useState('Últimos 30 días');
  const [isOpen, setIsOpen] = useState(false);

  const periods = [
    'Últimos 7 días',
    'Últimos 30 días',
    'Últimos 3 meses',
    'Últimos 6 meses',
    'Último año',
    'Año actual',
    'Año anterior'
  ];

  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
    setIsOpen(false);
    onFilterChange(period);
  };

  // Solo mostrar filtros para consultas de análisis
  const shouldShowFilters = () => {
    const queryLower = currentQuery.toLowerCase();
    const analysisKeywords = [
      'ventas', 'tendencia', 'análisis', 'métricas', 'dashboard',
      'comparar', 'evolución', 'estadísticas', 'gráfico'
    ];
    
    return analysisKeywords.some(keyword => queryLower.includes(keyword));
  };

  if (!shouldShowFilters()) {
    return null;
  }

  return (
    <div className="mb-6 p-4 bg-[#f8f9fc] rounded-lg border border-[#e9ecef]">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-[#6c757d]" />
            <span className="text-label">
              Filtrar por período:
            </span>
          </div>
          
          <div className="relative">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center space-x-2 px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <Calendar className="w-4 h-4 text-[#6c757d]" />
              <span className="text-secundario">{selectedPeriod}</span>
              <ChevronDown className="w-4 h-4 text-[#6c757d]" />
            </button>
            
            {isOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-300 rounded-md shadow-lg z-10">
                {periods.map((period) => (
                  <button
                    key={period}
                    onClick={() => handlePeriodChange(period)}
                    className={`w-full text-left px-3 py-2 text-secundario hover:bg-[#f8f9fc] first:rounded-t-md last:rounded-b-md ${
                      selectedPeriod === period ? 'bg-[#2F4050] text-white' : 'text-[#2F4050]'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2 text-muy-pequeno">
          <Clock className="w-3 h-3" />
          <span>Filtros automáticos</span>
        </div>
      </div>
      
      <div className="mt-3 flex items-center space-x-4 text-muy-pequeno">
        <div className="flex items-center space-x-1">
          <TrendingUp className="w-3 h-3" />
          <span>Análisis temporal activo</span>
        </div>
        <div className="flex items-center space-x-1">
          <Calendar className="w-3 h-3" />
          <span>Período: {selectedPeriod}</span>
        </div>
      </div>
    </div>
  );
};

export default DataFilters;
