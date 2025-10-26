'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import ReactMarkdown from 'react-markdown';
import { Copy, Check, Database, Clock, HelpCircle, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

export default function MessageBubble({ message }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const needsClarification = message.needsClarification || false;

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copiado al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copiando:', error);
      toast.error('Error copiando texto');
    }
  };

  const formatTime = (timestamp) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { 
        addSuffix: true, 
        locale: es 
      });
    } catch (error) {
      return 'hace un momento';
    }
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-3xl ${isUser ? 'order-2' : 'order-1'}`}>
        {/* Burbuja de mensaje */}
        <div
          className={`message-bubble ${
            isUser 
              ? 'message-user' 
              : needsClarification
              ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 text-gray-800'
              : 'message-assistant'
          }`}
        >
          {/* Icono de aclaración */}
          {needsClarification && (
            <div className="flex items-center space-x-2 mb-3 pb-3 border-b border-amber-200">
              <div className="p-2 bg-amber-100 rounded-full">
                <HelpCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-amber-900">Necesito más información</p>
                <p className="text-xs text-amber-700">Por favor, especifica el período para continuar</p>
              </div>
            </div>
          )}
        
          {/* Contenido del mensaje */}
          <div className="prose prose-sm max-w-none">
            {isAssistant ? (
              <ReactMarkdown
                components={{
                  code: ({ node, inline, className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <div className="relative">
                        <pre className="bg-gray-100 p-3 rounded-lg overflow-x-auto">
                          <code className={className} {...props}>
                            {children}
                          </code>
                        </pre>
                        <button
                          onClick={() => copyToClipboard(String(children))}
                          className="absolute top-2 right-2 p-1 rounded hover:bg-gray-200 transition-colors"
                        >
                          {copied ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4 text-gray-500" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props}>
                        {children}
                      </code>
                    );
                  },
                  table: ({ children }) => (
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse border border-gray-300">
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-gray-300 bg-gray-100 px-3 py-2 text-left font-medium">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-gray-300 px-3 py-2">
                      {children}
                    </td>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            ) : (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}
          </div>

          {/* Metadatos del mensaje */}
          <div className={`mt-2 flex items-center space-x-2 text-xs ${
            isUser ? 'text-primary-100' : 'text-gray-500'
          }`}>
            <Clock className="w-3 h-3" />
            <span>{formatTime(message.created_at)}</span>
            
            {isAssistant && message.mcp_tool_used && (
              <>
                <span>•</span>
                <div className="flex items-center space-x-1">
                  <Database className="w-3 h-3" />
                  <span>{message.mcp_tool_used}</span>
                </div>
              </>
            )}
            
            {isAssistant && message.execution_time_ms && (
              <>
                <span>•</span>
                <span>{message.execution_time_ms}ms</span>
              </>
            )}
          </div>
        </div>

        {/* Botón de copiar para mensajes del asistente */}
        {isAssistant && (
          <div className="mt-1 flex justify-start">
            <button
              onClick={() => copyToClipboard(message.content)}
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
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
