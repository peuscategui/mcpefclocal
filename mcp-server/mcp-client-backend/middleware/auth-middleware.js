// Middleware de autenticación
import AuthService from '../auth-service.js';

const authService = new AuthService();

// Middleware para verificar autenticación requerida
export const requireAuth = (req, res, next) => {
  authService.authenticateToken(req, res, next);
};

// Middleware para autenticación opcional
export const optionalAuth = (req, res, next) => {
  authService.optionalAuth(req, res, next);
};

// Middleware para verificar que el usuario es propietario del recurso
export const requireOwnership = (resourceUserIdField = 'user_id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Autenticación requerida',
        code: 'AUTH_REQUIRED'
      });
    }

    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
    
    if (!resourceUserId) {
      return res.status(400).json({ 
        error: 'ID de usuario no especificado',
        code: 'USER_ID_MISSING'
      });
    }

    if (req.user.id !== parseInt(resourceUserId)) {
      return res.status(403).json({ 
        error: 'No tienes permisos para acceder a este recurso',
        code: 'FORBIDDEN'
      });
    }

    next();
  };
};

// Middleware para validar entrada de datos
export const validateInput = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: error.details.map(detail => detail.message),
        code: 'VALIDATION_ERROR'
      });
    }
    next();
  };
};

// Middleware para logging de requests
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const userInfo = req.user ? `[${req.user.email}]` : '[Anónimo]';
  
  console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${userInfo}`);
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${duration}ms ${userInfo}`);
  });
  
  next();
};

// Middleware para manejo de errores
export const errorHandler = (error, req, res, next) => {
  console.error(`${new Date().toISOString()} Error:`, error);
  
  // Error de validación
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Error de validación',
      details: error.details || error.message,
      code: 'VALIDATION_ERROR'
    });
  }
  
  // Error de autenticación
  if (error.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'No autorizado',
      code: 'UNAUTHORIZED'
    });
  }
  
  // Error de base de datos
  if (error.name === 'DatabaseError') {
    return res.status(500).json({
      error: 'Error de base de datos',
      code: 'DATABASE_ERROR'
    });
  }
  
  // Error de MCP
  if (error.name === 'MCPError') {
    return res.status(502).json({
      error: 'Error del servidor MCP',
      details: error.message,
      code: 'MCP_ERROR'
    });
  }
  
  // Error de OpenAI
  if (error.name === 'OpenAIError') {
    return res.status(502).json({
      error: 'Error del servicio OpenAI',
      details: error.message,
      code: 'OPENAI_ERROR'
    });
  }
  
  // Error genérico
  res.status(500).json({
    error: 'Error interno del servidor',
    code: 'INTERNAL_ERROR'
  });
};

// Middleware para CORS
export const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3003',  // Puerto del frontend
      'http://localhost:3000',
      process.env.CORS_ORIGIN
    ].filter(Boolean);
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Middleware para rate limiting personalizado
export const createRateLimit = (windowMs, maxRequests) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Limpiar requests antiguos
    if (requests.has(key)) {
      const userRequests = requests.get(key).filter(time => time > windowStart);
      requests.set(key, userRequests);
    } else {
      requests.set(key, []);
    }
    
    const userRequests = requests.get(key);
    
    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Demasiadas solicitudes',
        retryAfter: Math.ceil(windowMs / 1000),
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }
    
    userRequests.push(now);
    requests.set(key, userRequests);
    
    next();
  };
};

export default {
  requireAuth,
  optionalAuth,
  requireOwnership,
  validateInput,
  requestLogger,
  errorHandler,
  corsOptions,
  createRateLimit
};
