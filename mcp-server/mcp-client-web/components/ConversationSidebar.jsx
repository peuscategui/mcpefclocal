'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Plus, 
  MessageSquare, 
  Clock, 
  Trash2, 
  Edit3, 
  Check, 
  X,
  Loader2 
} from 'lucide-react';
// import { chatAPI } from '@/lib/api-client'; // Removido para modo de prueba
import toast from 'react-hot-toast';

export default function ConversationSidebar({ 
  conversations, 
  currentConversation, 
  onSelectConversation, 
  onNewConversation,
  loading 
}) {
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingId, setDeletingId] = useState(null);

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

  const handleEditStart = (conversation) => {
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditTitle('');
  };

  const handleEditSave = async (conversationId) => {
    if (!editTitle.trim()) {
      toast.error('El título no puede estar vacío');
      return;
    }

    try {
      // Aquí deberías llamar a la API para actualizar el título
      // Por ahora solo actualizamos localmente
      toast.success('Título actualizado');
      setEditingId(null);
      setEditTitle('');
    } catch (error) {
      console.error('Error actualizando título:', error);
      toast.error('Error actualizando título');
    }
  };

  const handleDelete = async (conversationId) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta conversación?')) {
      return;
    }

    setDeletingId(conversationId);
    try {
      // Aquí deberías llamar a la API para eliminar la conversación
      toast.success('Conversación eliminada');
    } catch (error) {
      console.error('Error eliminando conversación:', error);
      toast.error('Error eliminando conversación');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="sidebar">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onNewConversation}
          className="w-full btn btn-primary flex items-center justify-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva conversación</span>
        </button>
      </div>

      {/* Lista de conversaciones */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
            <span className="ml-2 text-gray-600">Cargando...</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay conversaciones</p>
            <p className="text-xs mt-1">Crea una nueva para comenzar</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`conversation-item ${
                  currentConversation?.id === conversation.id ? 'active' : ''
                }`}
              >
                {editingId === conversation.id ? (
                  // Modo edición
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      autoFocus
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') handleEditSave(conversation.id);
                        if (e.key === 'Escape') handleEditCancel();
                      }}
                    />
                    <div className="flex space-x-1">
                      <button
                        onClick={() => handleEditSave(conversation.id)}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={handleEditCancel}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  // Modo normal
                  <div className="group">
                    <div
                      onClick={() => onSelectConversation(conversation)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-gray-900 truncate">
                            {conversation.title}
                          </h3>
                          <div className="flex items-center space-x-2 mt-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            <span>{formatTime(conversation.updated_at)}</span>
                            {conversation.message_count > 0 && (
                              <>
                                <span>•</span>
                                <span>{conversation.message_count} mensajes</span>
                              </>
                            )}
                          </div>
                        </div>
                        
                        {/* Botones de acción */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditStart(conversation);
                            }}
                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(conversation.id);
                            }}
                            disabled={deletingId === conversation.id}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                          >
                            {deletingId === conversation.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-500 text-center">
          <p>MCP Web Client v1.0.0</p>
          <p className="mt-1">Powered by OpenAI + SQL Server</p>
        </div>
      </div>
    </div>
  );
}
