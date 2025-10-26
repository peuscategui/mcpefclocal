'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { apiClient } from './api-client';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);
  const router = useRouter();

  useEffect(() => {
    // Verificar si hay token en localStorage
    const savedToken = localStorage.getItem('mcp_token');
    if (savedToken) {
      setToken(savedToken);
      verifyToken(savedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async (tokenToVerify) => {
    try {
      const response = await apiClient.get('/auth/me', {
        headers: { Authorization: `Bearer ${tokenToVerify}` }
      });
      
      if (response.data.user) {
        setUser(response.data.user);
        setToken(tokenToVerify);
      } else {
        throw new Error('Usuario no encontrado');
      }
    } catch (error) {
      console.error('Error verificando token:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (authData) => {
    try {
      const { token: newToken, user: userData } = authData;
      
      localStorage.setItem('mcp_token', newToken);
      setToken(newToken);
      setUser(userData);
      
      toast.success(`¡Bienvenido, ${userData.name}!`);
      router.push('/');
    } catch (error) {
      console.error('Error en login:', error);
      toast.error('Error iniciando sesión');
    }
  };

  const logout = () => {
    localStorage.removeItem('mcp_token');
    setToken(null);
    setUser(null);
    router.push('/login');
    toast.success('Sesión cerrada');
  };

  const refreshUser = async () => {
    if (!token) return;
    
    try {
      const response = await apiClient.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.user) {
        setUser(response.data.user);
      }
    } catch (error) {
      console.error('Error refrescando usuario:', error);
      logout();
    }
  };

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    refreshUser,
    isAuthenticated: !!user && !!token
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
