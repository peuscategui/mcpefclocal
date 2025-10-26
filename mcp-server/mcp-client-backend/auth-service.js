// Servicio de autenticación OAuth2
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
    this.setupStrategies();
  }

  setupStrategies() {
    // Google OAuth2 Strategy
    if (process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET) {
      passport.use(new GoogleStrategy({
        clientID: process.env.OAUTH_CLIENT_ID,
        clientSecret: process.env.OAUTH_CLIENT_SECRET,
        callbackURL: process.env.OAUTH_REDIRECT_URI || '/api/auth/callback'
      }, this.handleGoogleCallback.bind(this)));
    }

    // Microsoft OAuth2 Strategy
    if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
      passport.use(new MicrosoftStrategy({
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackURL: '/api/auth/microsoft/callback',
        scope: ['user.read']
      }, this.handleMicrosoftCallback.bind(this)));
    }

    // Serialize user for session
    passport.serializeUser((user, done) => {
      done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
      try {
        // Aquí deberías buscar el usuario en la base de datos
        // Por ahora retornamos un objeto básico
        done(null, { id });
      } catch (error) {
        done(error, null);
      }
    });
  }

  async handleGoogleCallback(accessToken, refreshToken, profile, done) {
    try {
      console.log('🔐 Procesando callback de Google:', profile.emails[0].value);
      
      const userData = {
        oauth_provider: 'google',
        oauth_id: profile.id,
        email: profile.emails[0].value,
        name: profile.displayName,
        picture_url: profile.photos[0]?.value
      };

      // Aquí deberías buscar o crear el usuario en la base de datos
      // Por ahora retornamos los datos del perfil
      done(null, userData);
    } catch (error) {
      console.error('❌ Error en callback de Google:', error.message);
      done(error, null);
    }
  }

  async handleMicrosoftCallback(accessToken, refreshToken, profile, done) {
    try {
      console.log('🔐 Procesando callback de Microsoft:', profile.emails[0].value);
      
      const userData = {
        oauth_provider: 'microsoft',
        oauth_id: profile.id,
        email: profile.emails[0].value,
        name: profile.displayName,
        picture_url: profile.photos[0]?.value
      };

      done(null, userData);
    } catch (error) {
      console.error('❌ Error en callback de Microsoft:', error.message);
      done(error, null);
    }
  }

  generateJWT(user) {
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      oauth_provider: user.oauth_provider,
      oauth_id: user.oauth_id
    };

    return jwt.sign(payload, this.jwtSecret, { 
      expiresIn: this.jwtExpiresIn,
      issuer: 'mcp-web-client',
      audience: 'mcp-web-client'
    });
  }

  verifyJWT(token) {
    try {
      return jwt.verify(token, this.jwtSecret, {
        issuer: 'mcp-web-client',
        audience: 'mcp-web-client'
      });
    } catch (error) {
      console.error('❌ Error verificando JWT:', error.message);
      return null;
    }
  }

  extractTokenFromHeader(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  // Middleware para verificar autenticación
  authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = this.extractTokenFromHeader(authHeader);

    if (!token) {
      return res.status(401).json({ 
        error: 'Token de acceso requerido',
        code: 'NO_TOKEN'
      });
    }

    const user = this.verifyJWT(token);
    if (!user) {
      return res.status(403).json({ 
        error: 'Token inválido o expirado',
        code: 'INVALID_TOKEN'
      });
    }

    req.user = user;
    next();
  }

  // Middleware para autenticación opcional
  optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = this.extractTokenFromHeader(authHeader);

    if (token) {
      const user = this.verifyJWT(token);
      if (user) {
        req.user = user;
      }
    }

    next();
  }

  // Generar URL de autorización para Google
  getGoogleAuthURL() {
    const params = new URLSearchParams({
      client_id: process.env.OAUTH_CLIENT_ID,
      redirect_uri: process.env.OAUTH_REDIRECT_URI || 'http://localhost:3001/api/auth/callback',
      scope: 'openid email profile',
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent'
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  // Generar URL de autorización para Microsoft
  getMicrosoftAuthURL() {
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      redirect_uri: 'http://localhost:3001/api/auth/microsoft/callback',
      scope: 'openid email profile',
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent'
    });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  // Validar configuración OAuth
  validateOAuthConfig() {
    const errors = [];

    if (!process.env.OAUTH_CLIENT_ID) {
      errors.push('OAUTH_CLIENT_ID no configurado');
    }
    if (!process.env.OAUTH_CLIENT_SECRET) {
      errors.push('OAUTH_CLIENT_SECRET no configurado');
    }
    if (!process.env.JWT_SECRET) {
      errors.push('JWT_SECRET no configurado');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Obtener información del usuario desde el token
  getUserFromToken(token) {
    return this.verifyJWT(token);
  }

  // Generar token de refresco (opcional)
  generateRefreshToken(user) {
    const payload = {
      id: user.id,
      type: 'refresh',
      oauth_provider: user.oauth_provider
    };

    return jwt.sign(payload, this.jwtSecret, { 
      expiresIn: '7d',
      issuer: 'mcp-web-client',
      audience: 'mcp-web-client'
    });
  }

  // Verificar token de refresco
  verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'mcp-web-client',
        audience: 'mcp-web-client'
      });

      if (decoded.type !== 'refresh') {
        throw new Error('Token no es de tipo refresh');
      }

      return decoded;
    } catch (error) {
      console.error('❌ Error verificando refresh token:', error.message);
      return null;
    }
  }
}

export default AuthService;
