'use client';

import { useState, useEffect } from 'react';
import { Settings, Plus, Eye, Power, PowerOff, ArrowLeft, X, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';

export default function PromptsAdminPage() {
  const router = useRouter();
  const [prompts, setPrompts] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [types, setTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('analysis');
  const [selectedProfile, setSelectedProfile] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingPrompt, setViewingPrompt] = useState(null);
  const [loading, setLoading] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  useEffect(() => {
    loadPrompts();
    loadProfiles();
    loadTypes();
  }, [selectedType, selectedProfile]);

  const loadPrompts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedType) params.append('type', selectedType);
      if (selectedProfile) params.append('profile', selectedProfile);
      
      const res = await fetch(`${API_URL}/api/prompts?${params}`);
      const data = await res.json();
      if (data.success) {
        setPrompts(data.prompts);
      } else {
        toast.error('Error cargando prompts');
      }
    } catch (error) {
      toast.error('Error de conexión');
      console.error('Error loading prompts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProfiles = async () => {
    try {
      const res = await fetch(`${API_URL}/api/prompts/metadata/profiles`);
      const data = await res.json();
      if (data.success) {
        setProfiles(data.profiles);
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  };

  const loadTypes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/prompts/metadata/types`);
      const data = await res.json();
      if (data.success) {
        setTypes(data.types);
      }
    } catch (error) {
      console.error('Error loading types:', error);
    }
  };

  const handleActivate = async (promptId) => {
    try {
      const res = await fetch(`${API_URL}/api/prompts/${promptId}/activate`, { method: 'PUT' });
      const data = await res.json();
      if (data.success) {
        toast.success('Prompt activado exitosamente');
        loadPrompts();
      } else {
        toast.error('Error activando prompt');
      }
    } catch (error) {
      toast.error('Error de conexión');
      console.error('Error activating prompt:', error);
    }
  };

  const handleDeactivate = async (promptId) => {
    try {
      const res = await fetch(`${API_URL}/api/prompts/${promptId}/deactivate`, { method: 'PUT' });
      const data = await res.json();
      if (data.success) {
        toast.success('Prompt desactivado exitosamente');
        loadPrompts();
      } else {
        toast.error('Error desactivando prompt');
      }
    } catch (error) {
      toast.error('Error de conexión');
      console.error('Error deactivating prompt:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <Toaster position="top-right" />
      
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Administración de Prompts</h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition"
          >
            <Plus size={20} />
            Crear Prompt
          </button>
        </div>

        {/* Filtros */}
        <div className="bg-white p-4 rounded-lg shadow mb-6 flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Prompt</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {types.map(t => (
                <option key={t.id} value={t.type_name}>{t.description}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Perfil de Usuario</label>
            <select
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos los perfiles</option>
              {profiles.map(p => (
                <option key={p.id} value={p.profile_name}>{p.description}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Lista de prompts */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Cargando prompts...</div>
          ) : prompts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No hay prompts disponibles</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-left text-sm font-semibold text-gray-700">Nombre</th>
                  <th className="p-3 text-left text-sm font-semibold text-gray-700">Versión</th>
                  <th className="p-3 text-left text-sm font-semibold text-gray-700">Perfil</th>
                  <th className="p-3 text-left text-sm font-semibold text-gray-700">Estado</th>
                  <th className="p-3 text-left text-sm font-semibold text-gray-700">Creado</th>
                  <th className="p-3 text-right text-sm font-semibold text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {prompts.map(prompt => (
                  <tr key={prompt.id} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="p-3 text-sm text-gray-900">{prompt.name}</td>
                    <td className="p-3 text-sm text-gray-600">v{prompt.version}</td>
                    <td className="p-3 text-sm text-gray-600">{prompt.profile_name || 'Todos'}</td>
                    <td className="p-3">
                      {prompt.is_active ? (
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                          Activo
                        </span>
                      ) : (
                        <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-medium">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-sm text-gray-600">
                      {new Date(prompt.created_at).toLocaleDateString('es-PE')}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setViewingPrompt(prompt)}
                          className="text-blue-600 hover:text-blue-800 p-1"
                          title="Ver contenido"
                        >
                          <Eye size={18} />
                        </button>
                        {prompt.is_active ? (
                          <button
                            onClick={() => handleDeactivate(prompt.id)}
                            className="text-red-600 hover:text-red-800 p-1"
                            title="Desactivar"
                          >
                            <PowerOff size={18} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleActivate(prompt.id)}
                            className="text-green-600 hover:text-green-800 p-1"
                            title="Activar"
                          >
                            <Power size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal: Ver Prompt */}
        {viewingPrompt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{viewingPrompt.name}</h2>
                  <p className="text-sm text-gray-600">
                    Versión {viewingPrompt.version} • {viewingPrompt.profile_name || 'Todos los perfiles'}
                  </p>
                </div>
                <button
                  onClick={() => setViewingPrompt(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono bg-gray-50 p-4 rounded">
                  {viewingPrompt.content}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Crear Prompt */}
        {showCreateModal && (
          <CreatePromptModal
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => {
              setShowCreateModal(false);
              loadPrompts();
            }}
            types={types}
            profiles={profiles}
            apiUrl={API_URL}
          />
        )}
      </div>
    </div>
  );
}

function CreatePromptModal({ onClose, onSuccess, types, profiles, apiUrl }) {
  const [formData, setFormData] = useState({
    name: '',
    promptType: 'analysis',
    userProfile: '',
    content: ''
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.content) {
      toast.error('Nombre y contenido son requeridos');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${apiUrl}/api/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptType: formData.promptType,
          userProfile: formData.userProfile || null,
          name: formData.name,
          content: formData.content,
          createdBy: null // Sin autenticación por ahora
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Prompt creado: v${data.version}`);
        onSuccess();
      } else {
        toast.error('Error creando prompt: ' + data.error);
      }
    } catch (error) {
      toast.error('Error de conexión');
      console.error('Error creating prompt:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Crear Nuevo Prompt</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del Prompt *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: Prompt de Análisis Comercial v2"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Prompt *
                </label>
                <select
                  value={formData.promptType}
                  onChange={(e) => setFormData({ ...formData, promptType: e.target.value })}
                  className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  {types.map(t => (
                    <option key={t.id} value={t.type_name}>{t.description}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Perfil de Usuario
                </label>
                <select
                  value={formData.userProfile}
                  onChange={(e) => setFormData({ ...formData, userProfile: e.target.value })}
                  className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Todos los perfiles</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.profile_name}>{p.description}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contenido del Prompt *
              </label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                rows={20}
                placeholder="Escribe el contenido del prompt aquí..."
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                {formData.content.length} caracteres
              </p>
            </div>
          </div>
        </form>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition disabled:opacity-50"
          >
            <Save size={18} />
            {saving ? 'Guardando...' : 'Guardar Prompt'}
          </button>
        </div>
      </div>
    </div>
  );
}

