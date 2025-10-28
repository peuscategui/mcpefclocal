'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { chatAPI } from '@/lib/api-client';
import ChatInterface from '@/components/ChatInterface';
import ConversationSidebar from '@/components/ConversationSidebar';
import { Menu, X, Database, User, Settings } from 'lucide-react';
import toast from 'react-hot-toast';

export default function HomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user] = useState({ name: 'Usuario de Prueba' }); // Usuario simulado
  const router = useRouter();

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      // Simular conversaciones para modo de prueba
      setConversations([
        { id: 1, title: 'Consulta de prueba', updatedAt: new Date().toISOString() },
        { id: 2, title: 'Análisis de datos', updatedAt: new Date().toISOString() }
      ]);
    } catch (error) {
      console.error('Error cargando conversaciones:', error);
      toast.error('Error cargando conversaciones');
    } finally {
      setLoading(false);
    }
  };

  const handleNewConversation = () => {
    setCurrentConversation(null);
    setSidebarOpen(false);
  };

  const handleUserChange = (userId) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('currentUser', userId);
      window.location.reload(); // Recargar para aplicar el cambio
    }
  };

  const handleSelectConversation = (conversation) => {
    setCurrentConversation(conversation);
    setSidebarOpen(false);
  };

  const handleConversationUpdate = (updatedConversation) => {
    setConversations(prev => 
      prev.map(conv => 
        conv.id === updatedConversation.id ? updatedConversation : conv
      )
    );
  };

  const handleNewMessage = async (message, conversationId) => {
    try {
      // ⚡ Seleccionar usuario actual (por defecto: 'admin')
      const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('currentUser') || 'admin' : 'admin';
      
      // Llamar directamente al backend
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message,
          userId: currentUserId  // Enviar ID del usuario
        })
      });
      
      const data = await response.json();
      
      console.log('🌐 Response del fetch:', data);
      
      if (data.success) {
        // ⚡ IMPORTANTE: Retornar TODA la respuesta con metadata incluida
        console.log('📦 Retornando data.response:', data.response);
        return data.response;
      } else {
        throw new Error(data.error || 'Error en la respuesta del servidor');
      }
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      toast.error('Error enviando mensaje');
      throw error;
    }
  };

  // Verificación de autenticación removida para pruebas

  return (
    <div className="h-screen flex bg-[#f8f9fc]">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-80 bg-white border-r border-[#e9ecef] transform transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 lg:static lg:inset-0`}>
        <ConversationSidebar
          conversations={conversations}
          currentConversation={currentConversation}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          loading={loading}
        />
      </div>

      {/* Overlay para móvil */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-[#e9ecef] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            
            <div className="flex items-center space-x-2">
              <Database className="w-6 h-6 text-[#2F4050]" />
              <h1 className="text-lg font-semibold text-[#2F4050]">
                MCP EFC Comercial
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Botón de Admin (solo para admin) */}
            <button
              onClick={() => router.push('/admin/prompts')}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-blue-600 transition"
              title="Administrar Prompts"
            >
              <Settings className="w-5 h-5" />
            </button>
            
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <User className="w-4 h-4" />
              <span>{user?.name}</span>
            </div>
            
            <select
              onChange={(e) => handleUserChange(e.target.value)}
              defaultValue={'admin'}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="admin">👤 Administrador</option>
              <option value="caceres">👤 Cáceres</option>
            </select>
          </div>
        </header>

        {/* Chat Interface */}
        <main className="flex-1 overflow-hidden">
          <ChatInterface
            currentConversation={currentConversation}
            onSendMessage={handleNewMessage}
            onConversationUpdate={handleConversationUpdate}
          />
        </main>
      </div>
    </div>
  );
}
