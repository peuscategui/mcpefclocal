// components/KPICards.jsx
import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  DollarSign,
  Users,
  Building2,
  Activity,
  BarChart3,
  Target,
  Award,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw
} from 'lucide-react';

const KPICards = ({ response, query }) => {
  // Función para extraer métricas clave del texto
  const extractKPIs = (responseText, userQuery, dataPreview) => {
    const kpis = [];
    const lines = responseText.split('\n');
    
    // Detectar si es un comparativo entre años
    const esComparativo = userQuery.toLowerCase().includes('comparativo') || 
                         userQuery.toLowerCase().includes('comparar') || 
                         userQuery.toLowerCase().includes('vs');
    
    // Extraer el año de la consulta del usuario
    const yearMatch = userQuery.match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
    
    // Si es comparativo Y tenemos dataPreview, extraer datos de ambos años
    if (esComparativo && dataPreview && dataPreview.data) {
      const datos = dataPreview.data;
      
      // Agrupar datos por año
      const datos2024 = datos.filter(d => d.Año === 2024);
      const datos2025 = datos.filter(d => d.Año === 2025);
      
      const total2024 = datos2024.reduce((sum, d) => sum + (d.Ventas || 0), 0);
      const total2025 = datos2025.reduce((sum, d) => sum + (d.Ventas || 0), 0);
      const crecimiento = total2024 > 0 ? ((total2025 - total2024) / total2024) * 100 : 0;
      
      // KPI: Total 2024
      kpis.push({
        title: 'Total 2024',
        value: `S/ ${(total2024 / 1000000).toFixed(1)}M`,
        icon: DollarSign,
        color: 'blue',
        trend: 'neutral',
        category: 'financial',
        subtitle: `${datos2024.length} meses`
      });
      
      // KPI: Total 2025
      kpis.push({
        title: 'Total 2025',
        value: `S/ ${(total2025 / 1000000).toFixed(1)}M`,
        icon: DollarSign,
        color: 'green',
        trend: crecimiento >= 0 ? 'up' : 'down',
        category: 'financial',
        subtitle: `${datos2025.length} meses`
      });
      
      // KPI: Crecimiento
      kpis.push({
        title: 'Crecimiento',
        value: `${crecimiento >= 0 ? '+' : ''}${crecimiento.toFixed(1)}%`,
        icon: crecimiento >= 0 ? TrendingUp : TrendingDown,
        color: crecimiento >= 0 ? 'green' : 'red',
        trend: crecimiento >= 0 ? 'up' : 'down',
        category: 'performance',
        subtitle: '2024 vs 2025'
      });
      
      return kpis;
    }
    
    // Variables para calcular métricas reales (modo normal, no comparativo)
    let totalVentas = 0;
    let totalTransacciones = 0;
    let meses = [];
    let mejorMes = null;
    let peorMes = null;
    
    // ✅ PRIORIDAD: Usar dataPreview si está disponible
    if (dataPreview && dataPreview.data && dataPreview.data.length > 0) {
      console.log('📊 KPICards - Calculando desde dataPreview:', dataPreview.data);
      
      dataPreview.data.forEach(row => {
        const venta = parseFloat(row.Ventas || 0);
        const transacciones = parseInt(row.Transacciones || 0);
        
        // Determinar el nombre del período (mes o día)
        let periodo = '';
        if (row.Mes) {
          periodo = row.Mes;
        } else if (row.Dia) {
          periodo = `Día ${row.Dia}`;
        } else if (row.MesNumero) {
          const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
          periodo = nombresMeses[row.MesNumero - 1] || `Mes ${row.MesNumero}`;
        } else {
          periodo = 'Período';
        }
        
        if (venta > 0) {
          meses.push({ mes: periodo, venta });
          totalVentas += venta;
          
          if (!mejorMes || venta > mejorMes.venta) {
            mejorMes = { mes: periodo, venta };
          }
          if (!peorMes || venta < peorMes.venta) {
            peorMes = { mes: periodo, venta };
          }
        }
        
        if (transacciones > 0) {
          totalTransacciones += transacciones;
        }
      });
      
      console.log('💰 KPICards - Totales calculados:', {
        totalVentas,
        totalTransacciones,
        meses: meses.length,
        mejorMes,
        peorMes
      });
    } else {
      // Fallback: Intentar extraer del texto (método anterior)
      lines.forEach(line => {
        // Buscar datos de ventas mensuales específicos
        const ventaMatch = line.match(/(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre).*?S\/\s*([\d,]+\.?\d*)/i);
        if (ventaMatch) {
          const mes = ventaMatch[1];
          const venta = parseFloat(ventaMatch[2].replace(/,/g, ''));
          meses.push({ mes, venta });
          totalVentas += venta;
          
          if (!mejorMes || venta > mejorMes.venta) {
            mejorMes = { mes, venta };
          }
          if (!peorMes || venta < peorMes.venta) {
            peorMes = { mes, venta };
          }
        }
        
        // Buscar transacciones específicas
        const transMatch = line.match(/Transacciones.*?(\d+)/i);
        if (transMatch) {
          totalTransacciones += parseInt(transMatch[1]);
        }
      });
    }
    
    // Calcular métricas reales basadas en los datos encontrados
    if (meses.length > 0) {
      const promedioVentas = totalVentas / meses.length;
      
      // Total de Ventas (dinámico según el año de la consulta)
      kpis.push({
        title: `Total Ventas ${year}`,
        value: `S/ ${(totalVentas / 1000000).toFixed(1)}M`,
        icon: DollarSign,
        color: 'green',
        trend: 'up',
        category: 'financial',
        subtitle: `${meses.length} meses analizados`
      });
      
      // Promedio Mensual
      kpis.push({
        title: 'Promedio Mensual',
        value: `S/ ${(promedioVentas / 1000000).toFixed(1)}M`,
        icon: Target,
        color: 'blue',
        trend: 'neutral',
        category: 'analytics',
        subtitle: 'Promedio de ventas por mes'
      });
      
      // Mejor Mes
      if (mejorMes) {
        kpis.push({
          title: 'Mejor Mes',
          value: mejorMes.mes,
          subtitle: `S/ ${(mejorMes.venta / 1000000).toFixed(1)}M`,
          icon: Award,
          color: 'green',
          trend: 'up',
          category: 'achievement'
        });
      }
      
      // Mes con Menor Rendimiento
      if (peorMes) {
        kpis.push({
          title: 'Mes Bajo',
          value: peorMes.mes,
          subtitle: `S/ ${(peorMes.venta / 1000000).toFixed(1)}M`,
          icon: AlertTriangle,
          color: 'orange',
          trend: 'down',
          category: 'alert'
        });
      }
      
      // Crecimiento (comparando primer vs último mes)
      if (meses.length >= 2) {
        const primerMes = meses[0].venta;
        const ultimoMes = meses[meses.length - 1].venta;
        const crecimiento = ((ultimoMes - primerMes) / primerMes) * 100;
        
        kpis.push({
          title: 'Crecimiento Anual',
          value: `${crecimiento >= 0 ? '+' : ''}${crecimiento.toFixed(1)}%`,
          icon: crecimiento >= 0 ? TrendingUp : TrendingDown,
          color: crecimiento >= 0 ? 'green' : 'red',
          trend: crecimiento >= 0 ? 'up' : 'down',
          category: 'performance',
          subtitle: `${meses[0].mes} vs ${meses[meses.length - 1].mes}`
        });
      }
    }
    
    // Total de Transacciones (solo si encontramos datos específicos)
    if (totalTransacciones > 0) {
      kpis.push({
        title: 'Total Transacciones',
        value: totalTransacciones.toLocaleString(),
        icon: Users,
        color: 'blue',
        trend: 'up',
        category: 'volume',
        subtitle: 'Operaciones registradas'
      });
    }
    
    return kpis;
  };

  // Función para determinar si mostrar KPIs
  const shouldShowKPIs = (response, query) => {
    const queryLower = query.toLowerCase();
    
    // Mostrar KPIs si hay dataPreview con datos de ventas
    if (response.dataPreview && response.dataPreview.data && response.dataPreview.data.length > 0) {
      const hasVentasColumn = response.dataPreview.data.some(row => row.Ventas !== undefined);
      if (hasVentasColumn) {
        return true;
      }
    }
    
    // Fallback: Solo mostrar KPIs para consultas específicas de análisis comercial
    const specificKeywords = [
      'ventas', 'información de ventas', 'análisis de ventas',
      'tendencia', 'evolución', 'mensual', 'anual',
      'dashboard', 'métricas', 'estadísticas comerciales',
      'comparativo', 'comparar'
    ];
    
    return specificKeywords.some(keyword => queryLower.includes(keyword));
  };

  const shouldShow = shouldShowKPIs(response, query);
  
  if (!shouldShow) {
    return null;
  }

  const kpis = extractKPIs(response.content, query, response.dataPreview);
  
  if (kpis.length === 0) {
    return null;
  }

  const getColorClasses = (color) => {
    const colors = {
      green: {
        bg: 'bg-gradient-to-br from-green-50 to-green-100',
        border: 'border-green-200',
        icon: 'text-green-600',
        value: 'text-green-900',
        badge: 'bg-green-500 text-white',
        accent: 'bg-green-500'
      },
      red: {
        bg: 'bg-gradient-to-br from-red-50 to-red-100',
        border: 'border-red-200',
        icon: 'text-red-600',
        value: 'text-red-900',
        badge: 'bg-red-500 text-white',
        accent: 'bg-red-500'
      },
      blue: {
        bg: 'bg-gradient-to-br from-blue-50 to-blue-100',
        border: 'border-blue-200',
        icon: 'text-blue-600',
        value: 'text-blue-900',
        badge: 'bg-blue-500 text-white',
        accent: 'bg-blue-500'
      },
      orange: {
        bg: 'bg-gradient-to-br from-orange-50 to-orange-100',
        border: 'border-orange-200',
        icon: 'text-orange-600',
        value: 'text-orange-900',
        badge: 'bg-orange-500 text-white',
        accent: 'bg-orange-500'
      }
    };
    return colors[color] || colors.blue;
  };

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4" />;
      case 'down':
        return <TrendingDown className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'financial':
        return <DollarSign className="w-3 h-3" />;
      case 'performance':
        return <Target className="w-3 h-3" />;
      case 'achievement':
        return <Award className="w-3 h-3" />;
      case 'alert':
        return <AlertTriangle className="w-3 h-3" />;
      case 'analytics':
        return <BarChart3 className="w-3 h-3" />;
      case 'volume':
        return <Users className="w-3 h-3" />;
      default:
        return <Activity className="w-3 h-3" />;
    }
  };

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
              <h3 className="text-lg font-semibold text-white">
                📊 Métricas Clave Ejecutivas
              </h3>
              <p className="text-sm text-white/80">
                Indicadores de rendimiento comercial
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4 text-white" />
            </button>
            <div className="flex items-center space-x-2 text-white/80">
              <Clock className="w-4 h-4" />
              <span className="text-sm">Tiempo real</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs Grid */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {kpis.map((kpi, index) => {
            const colors = getColorClasses(kpi.color);
            const IconComponent = kpi.icon;
            
            return (
              <div 
                key={index}
                className={`${colors.bg} ${colors.border} border rounded-xl p-5 shadow-sm hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1`}
              >
                {/* Header de la tarjeta */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    {getCategoryIcon(kpi.category)}
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">
                      {kpi.category}
                    </span>
                  </div>
                  
                  {kpi.trend && (
                    <div className={`p-1 rounded-full ${colors.badge}`}>
                      {getTrendIcon(kpi.trend)}
                    </div>
                  )}
                </div>

                {/* Contenido principal */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-3">
                    <div className={`p-3 rounded-xl ${colors.bg} border ${colors.border}`}>
                      <IconComponent className={`w-6 h-6 ${colors.icon}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-600 mb-1">
                        {kpi.title}
                      </p>
                      <p className={`text-2xl font-bold ${colors.value}`}>
                        {kpi.value}
                      </p>
                      {kpi.subtitle && (
                        <p className="text-xs text-gray-500 mt-1">
                          {kpi.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Barra de progreso visual */}
                <div className="mt-4">
                  <div className="w-full bg-gray-200 rounded-full h-1">
                    <div 
                      className={`h-1 rounded-full ${colors.accent} transition-all duration-1000`}
                      style={{ 
                        width: kpi.trend === 'up' ? '85%' : kpi.trend === 'down' ? '45%' : '65%' 
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Footer informativo */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 text-sm text-gray-500">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>{kpis.length} métricas calculadas</span>
              </div>
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-blue-500" />
                <span>Análisis automático</span>
              </div>
            </div>
            
            <div className="text-xs text-gray-400">
              💡 Datos extraídos automáticamente del análisis
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KPICards;