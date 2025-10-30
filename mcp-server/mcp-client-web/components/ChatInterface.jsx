'use client';

import { useState, useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import DataTable from './DataTable';
import DashboardChart from './DashboardChart';
import KPICards from './KPICards';
import MonthlyAnalysis from './MonthlyAnalysis';
import ComparativeTable from './ComparativeTable';
import VisualizacionEjecutiva from './VisualizacionEjecutiva';
import { Send, Loader2, Database, Brain } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ChatInterface({ 
  currentConversation, 
  onSendMessage, 
  onConversationUpdate 
}) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (currentConversation) {
      loadMessages();
    } else {
      setMessages([]);
    }
  }, [currentConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async () => {
    if (!currentConversation) return;

    setLoadingMessages(true);
    try {
      const response = await chatAPI.getConversation(currentConversation.id);
      setMessages(response.data.conversation.messages || []);
    } catch (error) {
      console.error('Error cargando mensajes:', error);
      toast.error('Error cargando mensajes');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!inputMessage.trim() || loading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setLoading(true);

    // Agregar mensaje del usuario inmediatamente
    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await onSendMessage(userMessage, currentConversation?.id);
      
      // Agregar respuesta del asistente
      const assistantMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: response.content,
        mcp_tool_used: response.mcpToolUsed,
        sql_query: response.sqlQuery,
        execution_time_ms: response.executionTime,
        created_at: new Date().toISOString(),
        // Agregar datos para visualización
        rawData: response.rawData,
        dataPreview: response.dataPreview,
        // ⚡ NUEVO: Capturar metadata completa del backend
        metadata: response.metadata,
        // Agregar flag de aclaración
        needsClarification: response.needsClarification,
        clarificationType: response.clarificationType
      };
      
      // Log para debugging
      console.log('📦 Response completa del backend:', response);
      console.log('📊 AssistantMsg que se guardará:', assistantMsg);
      console.log('🔍 DataPreview:', response.dataPreview);
      console.log('🎨 Metadata completa:', response.metadata);
      
      if (response.metadata?.visualizacion) {
        console.log('✅ Metadata de visualización recibida:', {
          tipo_analisis: response.metadata.tipo_analisis,
          periodo_unico: response.metadata.visualizacion.periodo_unico,
          cantidad_periodos: response.metadata.visualizacion.cantidad_periodos,
          visualizaciones: Object.keys(response.metadata.visualizacion.visualizaciones_recomendadas)
            .filter(k => response.metadata.visualizacion.visualizaciones_recomendadas[k])
        });
      } else {
        console.log('❌ NO hay metadata.visualizacion en la response');
      }
      
      setMessages(prev => [...prev, assistantMsg]);
      
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      
      // Agregar mensaje de error
      const errorMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: 'Lo siento, hubo un error procesando tu consulta. Por favor, inténtalo de nuevo.',
        created_at: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const renderWelcomeMessage = () => (
    <div className="text-center py-12">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-center space-x-2 mb-4">
          <Database className="w-8 h-8 text-[#2F4050]" />
          <Brain className="w-8 h-8 text-[#2F4050]" />
        </div>
        
        <h2 className="text-h1-primary mb-2">
          ¡Hola! Soy tu asistente de base de datos
        </h2>
        
        <p className="text-descripcion-pagina mb-6">
          Puedes preguntarme sobre tus datos en lenguaje natural. 
          Por ejemplo: "¿Qué tablas hay?" o "Muéstrame todos los usuarios"
        </p>
        
        <div className="space-y-2 text-secundario">
          <p>💡 <strong>Tip:</strong> Empieza preguntando qué tablas están disponibles</p>
          <p>🔍 <strong>Ejemplo:</strong> "¿Cuántos productos hay en stock?"</p>
          <p>📊 <strong>Consulta:</strong> "Muéstrame las ventas del último mes"</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#f8f9fc]">
      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loadingMessages ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#27ae60]" />
            <span className="ml-2 text-secundario">Cargando mensajes...</span>
          </div>
        ) : messages.length === 0 ? (
          renderWelcomeMessage()
        ) : (
          messages.map((message, index) => (
            <div key={message.id}>
              <MessageBubble message={message} />
              
              {/* ⚡ NO mostrar visualizaciones ni tablas si requiere aclaración */}
              {!message.needsClarification && (
                <>
                  {/* ⚡ VISUALIZACIONES EJECUTIVAS ACTIVADAS */}
                  {message.role === 'assistant' && message.metadata?.visualizacion && (
                    <VisualizacionEjecutiva metadata={message.metadata.visualizacion} />
                  )}
                  
                  {/* Tabla de datos si está disponible - SIEMPRE mostrar si existe dataPreview */}
                  {message.role === 'assistant' && message.dataPreview && (
                    <div className="mt-4">
                      <DataTable 
                        data={message.dataPreview.data ? message.dataPreview : { data: message.dataPreview }} 
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          ))
        )}
        
        {loading && (
          <div className="flex items-center space-x-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Procesando tu consulta...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input de mensaje */}
      <div className="border-t border-gray-200 bg-white p-4">
        <form onSubmit={handleSendMessage} className="flex space-x-3">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Escribe tu pregunta sobre la base de datos..."
              className="w-full px-3 py-2 border border-[#e9ecef] rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#2F4050] focus:border-transparent bg-white text-[#2F4050]"
              rows={1}
              style={{ minHeight: '40px', maxHeight: '120px' }}
              disabled={loading}
            />
          </div>
          
          <button
            type="submit"
            disabled={!inputMessage.trim() || loading}
            className="bg-[#2F4050] hover:bg-[#2F4050]/90 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span>Enviar</span>
          </button>
        </form>
        
        <div className="mt-2 text-muy-pequeno text-center">
          Presiona Enter para enviar, Shift+Enter para nueva línea
        </div>
      </div>
    </div>
  );
}
