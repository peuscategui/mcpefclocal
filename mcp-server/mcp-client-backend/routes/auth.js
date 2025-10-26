// Rutas de autenticación OAuth2
import express from 'express';
import passport from 'passport';
import AuthService from '../auth-service.js';
import DatabaseService from '../db-service.js';
import { requireAuth } from '../middleware/auth-middleware.js';

const router = express.Router();
const authService = new AuthService();
const dbService = new DatabaseService();

// Inicializar servicios
await dbService.connect();

// Ruta de login - redirige a Google OAuth
router.get('/login', (req, res) => {
  const authURL = authService.getGoogleAuthURL();
  res.json({ 
    authURL,
    message: 'Redirigir a Google OAuth'
  });
});

// Ruta de callback de Google OAuth
router.get('/callback', 
  passport.authenticate('google', { session: false }),
  async (req, res) => {
    try {
      const profile = req.user;
      
      // Buscar usuario existente
      let user = await dbService.findUserByOAuthId(profile.oauth_provider, profile.oauth_id);
      
      if (!user) {
        // Crear nuevo usuario
        user = await dbService.createUser(profile);
        console.log('✅ Nuevo usuario creado:', user.email);
      } else {
        // Actualizar último login
        await dbService.updateUserLastLogin(user.id);
        console.log('✅ Usuario existente:', user.email);
      }
      
      // Generar JWT
      const token = authService.generateJWT(user);
      const refreshToken = authService.generateRefreshToken(user);
      
      // Configurar cookies (opcional)
      res.cookie('jwt', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
      });
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture_url: user.picture_url,
          oauth_provider: user.oauth_provider
        },
        token,
        refreshToken
      });
      
    } catch (error) {
      console.error('❌ Error en callback OAuth:', error.message);
      res.status(500).json({
        error: 'Error procesando autenticación',
        code: 'AUTH_CALLBACK_ERROR'
      });
    }
  }
);

// Ruta de callback de Microsoft OAuth
router.get('/microsoft/callback',
  passport.authenticate('microsoft', { session: false }),
  async (req, res) => {
    try {
      const profile = req.user;
      
      let user = await dbService.findUserByOAuthId(profile.oauth_provider, profile.oauth_id);
      
      if (!user) {
        user = await dbService.createUser(profile);
      } else {
        await dbService.updateUserLastLogin(user.id);
      }
      
      const token = authService.generateJWT(user);
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture_url: user.picture_url,
          oauth_provider: user.oauth_provider
        },
        token
      });
      
    } catch (error) {
      console.error('❌ Error en callback Microsoft:', error.message);
      res.status(500).json({
        error: 'Error procesando autenticación Microsoft',
        code: 'MICROSOFT_CALLBACK_ERROR'
      });
    }
  }
);

// Ruta para obtener información del usuario actual
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await dbService.findUserByOAuthId(req.user.oauth_provider, req.user.oauth_id);
    
    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Obtener estadísticas del usuario
    const stats = await dbService.getUserStats(user.id);
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture_url: user.picture_url,
        oauth_provider: user.oauth_provider,
        created_at: user.created_at,
        last_login: user.last_login
      },
      stats
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo información del usuario:', error.message);
    res.status(500).json({
      error: 'Error obteniendo información del usuario',
      code: 'USER_INFO_ERROR'
    });
  }
});

// Ruta para refrescar token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        error: 'Refresh token requerido',
        code: 'REFRESH_TOKEN_MISSING'
      });
    }
    
    const decoded = authService.verifyRefreshToken(refreshToken);
    
    if (!decoded) {
      return res.status(403).json({
        error: 'Refresh token inválido',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }
    
    // Buscar usuario
    const user = await dbService.findUserByOAuthId(decoded.oauth_provider, decoded.oauth_id);
    
    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Generar nuevo token
    const newToken = authService.generateJWT(user);
    const newRefreshToken = authService.generateRefreshToken(user);
    
    res.json({
      token: newToken,
      refreshToken: newRefreshToken
    });
    
  } catch (error) {
    console.error('❌ Error refrescando token:', error.message);
    res.status(500).json({
      error: 'Error refrescando token',
      code: 'REFRESH_ERROR'
    });
  }
});

// Ruta para logout
router.post('/logout', requireAuth, (req, res) => {
  // En un sistema más complejo, aquí invalidarías el token
  // Por ahora solo confirmamos el logout
  res.json({
    success: true,
    message: 'Logout exitoso'
  });
});

// Ruta para verificar estado de autenticación
router.get('/status', requireAuth, (req, res) => {
  res.json({
    authenticated: true,
    user: req.user
  });
});

// Ruta para obtener URLs de autenticación
router.get('/urls', (req, res) => {
  const config = authService.validateOAuthConfig();
  
  res.json({
    google: config.isValid ? authService.getGoogleAuthURL() : null,
    microsoft: process.env.MICROSOFT_CLIENT_ID ? authService.getMicrosoftAuthURL() : null,
    configValid: config.isValid,
    errors: config.errors
  });
});

export default router;
