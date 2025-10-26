import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token automáticamente
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('mcp_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar respuestas y errores
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado o inválido
      localStorage.removeItem('mcp_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Funciones específicas de la API
export const authAPI = {
  // Obtener URL de autenticación
  getAuthURL: () => apiClient.get('/auth/urls'),
  
  // Obtener información del usuario actual
  getMe: () => apiClient.get('/auth/me'),
  
  // Refrescar token
  refreshToken: (refreshToken) => apiClient.post('/auth/refresh', { refreshToken }),
  
  // Logout
  logout: () => apiClient.post('/auth/logout'),
};

export const chatAPI = {
  // Enviar mensaje de chat
  sendMessage: (message, conversationId) => 
    apiClient.post('/chat', { message, conversationId }),
  
  // Obtener conversaciones
  getConversations: (limit = 50, offset = 0) => 
    apiClient.get(`/conversations?limit=${limit}&offset=${offset}`),
  
  // Obtener conversación específica
  getConversation: (id) => 
    apiClient.get(`/conversations/${id}`),
  
  // Crear nueva conversación
  createConversation: (title) => 
    apiClient.post('/conversations', { title }),
  
  // Obtener herramientas MCP disponibles
  getTools: () => 
    apiClient.get('/tools'),
  
  // Obtener tablas disponibles
  getTables: () => 
    apiClient.get('/tables'),
  
  // Describir tabla específica
  describeTable: (tableName) => 
    apiClient.get(`/tables/${tableName}`),
};

export const healthAPI = {
  // Health check
  checkHealth: () => apiClient.get('/health'),
};

export default apiClient;
