// Servidor principal del backend MCP Client
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import session from 'express-session';
import passport from 'passport';
import dotenv from 'dotenv';

// Importar rutas
import authRoutes from './routes/auth.js';
import chatRoutes, { setMCPClient, initializeServices } from './routes/chat.js';
import promptRoutes, { setPromptService } from './routes/prompts.js';

// Importar middleware
import { 
  requestLogger, 
  errorHandler, 
  corsOptions, 
  createRateLimit 
} from './middleware/auth-middleware.js';

// Importar servicios
import AuthService from './auth-service.js';
import DatabaseService from './db-service.js';
import MCPClient from './mcp-client.js';

dotenv.config();

class MCPServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3001;
    this.authService = new AuthService();
    this.dbService = new DatabaseService();
    this.mcpClient = new MCPClient(process.env.MCP_HOST, process.env.MCP_PORT);
    this.isShuttingDown = false; // Flag para prevenir múltiples shutdowns
  }

  async initialize() {
    try {
      console.log('🚀 Iniciando servidor MCP Backend...');
      
      // Conectar a servicios
      await this.dbService.connect();
      console.log('✅ Base de datos conectada');
      
      await this.mcpClient.connect();
      await this.mcpClient.initialize();
      console.log('✅ Cliente MCP conectado');
      
      // Compartir el cliente MCP con las rutas de chat
      setMCPClient(this.mcpClient);
      console.log('✅ Cliente MCP compartido con rutas de chat');
      
      // Inicializar servicios de chat (DB para historial)
      await initializeServices();
      
      // Compartir PromptService con las rutas de prompts si DB está disponible
      if (this.dbService.isConnected && this.dbService.promptService) {
        setPromptService(this.dbService.promptService);
        console.log('✅ PromptService compartido con rutas de prompts');
      }
      
      // Configurar middleware
      this.setupMiddleware();
      
      // Configurar rutas
      this.setupRoutes();
      
      // Configurar manejo de errores
      this.setupErrorHandling();
      
      console.log('✅ Servidor inicializado correctamente');
      
    } catch (error) {
      console.error('❌ Error inicializando servidor:', error.message);
      throw error;
    }
  }

  setupMiddleware() {
    // Seguridad
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors(corsOptions));

    // Compresión
    this.app.use(compression());

    // Rate limiting
    const rateLimit = createRateLimit(
      parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutos
      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
    );
    this.app.use(rateLimit);

    // Logging de requests
    this.app.use(requestLogger);

    // Parseo de JSON
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Sesiones para OAuth
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'mcp-session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
      }
    }));

    // Passport
    this.app.use(passport.initialize());
    this.app.use(passport.session());
  }

  setupRoutes() {
    // Ruta de health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        service: 'mcp-backend',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Ruta de información del servicio
    this.app.get('/info', (req, res) => {
      res.json({
        name: 'MCP Web Client Backend',
        version: '1.0.0',
        description: 'Backend API para cliente web MCP con integración OpenAI y OAuth2',
        endpoints: {
          auth: '/api/auth',
          chat: '/api/chat',
          conversations: '/api/conversations',
          tools: '/api/tools',
          tables: '/api/tables'
        },
        features: [
          'Autenticación OAuth2 (Google, Microsoft)',
          'Integración OpenAI con Function Calling',
          'Cliente MCP TCP',
          'Gestión de conversaciones',
          'Historial de mensajes',
          'Rate limiting',
          'Logging completo'
        ]
      });
    });

    // Rutas de API
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api', chatRoutes);
    this.app.use('/api/prompts', promptRoutes);

    // Ruta 404
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint no encontrado',
        path: req.originalUrl,
        method: req.method,
        code: 'NOT_FOUND'
      });
    });
  }

  setupErrorHandling() {
    // Manejo de errores
    this.app.use(errorHandler);

    // Manejo de errores no capturados
    process.on('uncaughtException', (error) => {
      console.error('❌ Excepción no capturada:', error);
      this.gracefulShutdown();
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Promesa rechazada no manejada:', reason);
      this.gracefulShutdown();
    });

    // Manejo de señales de cierre
    process.on('SIGINT', () => {
      console.log('🛑 Recibida señal SIGINT');
      this.gracefulShutdown();
    });

    process.on('SIGTERM', () => {
      console.log('🛑 Recibida señal SIGTERM');
      this.gracefulShutdown();
    });
  }

  async start() {
    try {
      await this.initialize();
      
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        console.log(`🚀 Servidor MCP Backend iniciado en puerto ${this.port}`);
        console.log(`📍 Health check: http://0.0.0.0:${this.port}/health`);
        console.log(`📍 API Info: http://0.0.0.0:${this.port}/info`);
        console.log(`📍 Auth endpoints: http://0.0.0.0:${this.port}/api/auth`);
        console.log(`📍 Chat endpoints: http://0.0.0.0:${this.port}/api`);
        
        // Validar configuración
        this.validateConfiguration();
      });

    } catch (error) {
      console.error('❌ Error iniciando servidor:', error.message);
      process.exit(1);
    }
  }

  validateConfiguration() {
    const authConfig = this.authService.validateOAuthConfig();
    
    if (!authConfig.isValid) {
      console.warn('⚠️ Configuración OAuth incompleta:');
      authConfig.errors.forEach(error => console.warn(`   - ${error}`));
    }

    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️ OPENAI_API_KEY no configurado');
    }

    if (!process.env.MCP_HOST || !process.env.MCP_PORT) {
      console.warn('⚠️ Configuración MCP incompleta');
    }

    console.log('✅ Validación de configuración completada');
  }

  async gracefulShutdown() {
    // Prevenir múltiples llamadas al shutdown
    if (this.isShuttingDown) {
      console.log('⚠️ Shutdown ya en proceso, ignorando...');
      return;
    }
    
    this.isShuttingDown = true;
    console.log('🛑 Iniciando cierre graceful del servidor...');
    
    if (this.server) {
      this.server.close(async () => {
        console.log('🔌 Servidor HTTP cerrado');
        
        try {
          await this.dbService.disconnect();
          console.log('🔌 Base de datos desconectada');
        } catch (error) {
          console.error('❌ Error desconectando base de datos:', error.message);
        }

        try {
          this.mcpClient.disconnect();
          console.log('🔌 Cliente MCP desconectado');
        } catch (error) {
          console.error('❌ Error desconectando cliente MCP:', error.message);
        }

        console.log('✅ Cierre graceful completado');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }
}

// Iniciar servidor
const server = new MCPServer();
server.start().catch(error => {
  console.error('❌ Error fatal:', error.message);
  process.exit(1);
});

export default MCPServer;
