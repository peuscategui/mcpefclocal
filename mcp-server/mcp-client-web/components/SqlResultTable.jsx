'use client';

import { useState } from 'react';
import { Copy, Check, Database, Clock, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SqlResultTable({ sqlQuery, executionTime, toolUsed }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Consulta SQL copiada');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copiando:', error);
      toast.error('Error copiando consulta');
    }
  };

  // Parsear resultados SQL del formato MCP
  const parseSqlResults = (query) => {
    try {
      // El formato típico de MCP incluye JSON.stringify con recordset
      // Buscar patrones de datos tabulares en el texto
      const lines = query.split('\n');
      const dataLines = lines.filter(line => 
        line.includes('|') && !line.includes('---')
      );
      
      if (dataLines.length === 0) return null;
      
      const headers = dataLines[0].split('|').map(h => h.trim()).filter(h => h);
      const rows = dataLines.slice(1).map(line => 
        line.split('|').map(cell => cell.trim()).filter(cell => cell)
      );
      
      return { headers, rows };
    } catch (error) {
      console.error('Error parseando resultados SQL:', error);
      return null;
    }
  };

  const sqlData = parseSqlResults(sqlQuery);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      {/* Header con información de la consulta */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Database className="w-4 h-4" />
          <span>Resultado de consulta SQL</span>
          
          {toolUsed && (
            <>
              <span>•</span>
              <span className="capitalize">{toolUsed}</span>
            </>
          )}
          
          {executionTime && (
            <>
              <span>•</span>
              <div className="flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>{executionTime}ms</span>
              </div>
            </>
          )}
        </div>
        
        <button
          onClick={() => copyToClipboard(sqlQuery)}
          className="flex items-center space-x-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              <span>Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copiar SQL</span>
            </>
          )}
        </button>
      </div>

      {/* Consulta SQL */}
      <div className="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm overflow-x-auto">
        <pre className="whitespace-pre-wrap">{sqlQuery}</pre>
      </div>

      {/* Tabla de resultados */}
      {sqlData && sqlData.headers && sqlData.rows ? (
        <div className="overflow-x-auto">
          <table className="sql-result-table w-full">
            <thead>
              <tr>
                {sqlData.headers.map((header, index) => (
                  <th key={index} className="text-left font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sqlData.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-gray-50">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="text-sm">
                      {cell === 'NULL' ? (
                        <span className="text-gray-400 italic">NULL</span>
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Estadísticas */}
          <div className="mt-2 text-xs text-gray-500 flex items-center space-x-4">
            <span>{sqlData.rows.length} fila{sqlData.rows.length !== 1 ? 's' : ''}</span>
            <span>{sqlData.headers.length} columna{sqlData.headers.length !== 1 ? 's' : ''}</span>
            {executionTime && (
              <div className="flex items-center space-x-1">
                <Zap className="w-3 h-3" />
                <span>Ejecutado en {executionTime}ms</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-gray-500">
          <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Consulta ejecutada exitosamente</p>
          {executionTime && (
            <p className="text-xs mt-1">
              Tiempo de ejecución: {executionTime}ms
            </p>
          )}
        </div>
      )}
    </div>
  );
}
