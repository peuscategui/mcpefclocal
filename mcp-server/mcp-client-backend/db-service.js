// Servicio de base de datos para usuarios y conversaciones
import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

class DatabaseService {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      const config = {
        server: process.env.DB_HOST || '192.168.2.18',
        port: parseInt(process.env.DB_PORT) || 1433,
        database: process.env.DB_NAME || 'PRUEBA_MCP',
        user: process.env.DB_USER || 'MCP',
        password: process.env.DB_PASSWORD || 'm_25_9e_pe1_',
        options: {
          encrypt: process.env.DB_ENCRYPT === 'true' || true,
          trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || true,
          enableArithAbort: true,
          useUTC: false,
          connectionTimeout: 30000,
          requestTimeout: 30000,
        },
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000,
        },
      };

      this.pool = await sql.connect(config);
      this.isConnected = true;
      console.log('✅ Conectado a SQL Server para usuarios/conversaciones');
    } catch (error) {
      console.error('❌ Error conectando a SQL Server:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      this.isConnected = false;
      console.log('🔌 Desconectado de SQL Server');
    }
  }

  // Usuarios
  async createUser(userData) {
    const { oauth_provider, oauth_id, email, name, picture_url } = userData;
    
    try {
      const result = await this.pool.request()
        .input('oauth_provider', sql.VarChar(50), oauth_provider)
        .input('oauth_id', sql.VarChar(255), oauth_id)
        .input('email', sql.VarChar(255), email)
        .input('name', sql.VarChar(255), name)
        .input('picture_url', sql.VarChar(500), picture_url)
        .query(`
          INSERT INTO users (oauth_provider, oauth_id, email, name, picture_url)
          OUTPUT INSERTED.id, INSERTED.created_at
          VALUES (@oauth_provider, @oauth_id, @email, @name, @picture_url)
        `);

      return result.recordset[0];
    } catch (error) {
      console.error('❌ Error creando usuario:', error.message);
      throw error;
    }
  }

  async findUserByOAuthId(oauth_provider, oauth_id) {
    try {
      const result = await this.pool.request()
        .input('oauth_provider', sql.VarChar(50), oauth_provider)
        .input('oauth_id', sql.VarChar(255), oauth_id)
        .query(`
          SELECT id, oauth_provider, oauth_id, email, name, picture_url, 
                 created_at, last_login, is_active
          FROM users 
          WHERE oauth_provider = @oauth_provider AND oauth_id = @oauth_id AND is_active = 1
        `);

      return result.recordset[0] || null;
    } catch (error) {
      console.error('❌ Error buscando usuario:', error.message);
      throw error;
    }
  }

  async updateUserLastLogin(userId) {
    try {
      await this.pool.request()
        .input('user_id', sql.Int, userId)
        .query('UPDATE users SET last_login = GETDATE() WHERE id = @user_id');
    } catch (error) {
      console.error('❌ Error actualizando último login:', error.message);
      throw error;
    }
  }

  // Conversaciones
  async createConversation(userId, title) {
    try {
      const result = await this.pool.request()
        .input('user_id', sql.Int, userId)
        .input('title', sql.VarChar(500), title)
        .query(`
          INSERT INTO conversations (user_id, title)
          OUTPUT INSERTED.id, INSERTED.created_at, INSERTED.updated_at
          VALUES (@user_id, @title)
        `);

      return result.recordset[0];
    } catch (error) {
      console.error('❌ Error creando conversación:', error.message);
      throw error;
    }
  }

  async getConversationsByUser(userId, limit = 50, offset = 0) {
    try {
      const result = await this.pool.request()
        .input('user_id', sql.Int, userId)
        .input('limit', sql.Int, limit)
        .input('offset', sql.Int, offset)
        .query(`
          SELECT c.id, c.title, c.created_at, c.updated_at,
                 COUNT(m.id) as message_count
          FROM conversations c
          LEFT JOIN messages m ON c.id = m.conversation_id
          WHERE c.user_id = @user_id AND c.is_active = 1
          GROUP BY c.id, c.title, c.created_at, c.updated_at
          ORDER BY c.updated_at DESC
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

      return result.recordset;
    } catch (error) {
      console.error('❌ Error obteniendo conversaciones:', error.message);
      throw error;
    }
  }

  async getConversationById(conversationId, userId) {
    try {
      const result = await this.pool.request()
        .input('conversation_id', sql.Int, conversationId)
        .input('user_id', sql.Int, userId)
        .query(`
          SELECT c.id, c.title, c.created_at, c.updated_at
          FROM conversations c
          WHERE c.id = @conversation_id AND c.user_id = @user_id AND c.is_active = 1
        `);

      return result.recordset[0] || null;
    } catch (error) {
      console.error('❌ Error obteniendo conversación:', error.message);
      throw error;
    }
  }

  async updateConversationTitle(conversationId, userId, title) {
    try {
      await this.pool.request()
        .input('conversation_id', sql.Int, conversationId)
        .input('user_id', sql.Int, userId)
        .input('title', sql.VarChar(500), title)
        .query(`
          UPDATE conversations 
          SET title = @title, updated_at = GETDATE()
          WHERE id = @conversation_id AND user_id = @user_id AND is_active = 1
        `);
    } catch (error) {
      console.error('❌ Error actualizando título de conversación:', error.message);
      throw error;
    }
  }

  // Mensajes
  async createMessage(conversationId, role, content, mcpToolUsed = null, sqlQuery = null, executionTimeMs = null) {
    try {
      const result = await this.pool.request()
        .input('conversation_id', sql.Int, conversationId)
        .input('role', sql.VarChar(20), role)
        .input('content', sql.Text, content)
        .input('mcp_tool_used', sql.VarChar(100), mcpToolUsed)
        .input('sql_query', sql.Text, sqlQuery)
        .input('execution_time_ms', sql.Int, executionTimeMs)
        .query(`
          INSERT INTO messages (conversation_id, role, content, mcp_tool_used, sql_query, execution_time_ms)
          OUTPUT INSERTED.id, INSERTED.created_at
          VALUES (@conversation_id, @role, @content, @mcp_tool_used, @sql_query, @execution_time_ms)
        `);

      return result.recordset[0];
    } catch (error) {
      console.error('❌ Error creando mensaje:', error.message);
      throw error;
    }
  }

  async getMessagesByConversation(conversationId, userId, limit = 100) {
    try {
      const result = await this.pool.request()
        .input('conversation_id', sql.Int, conversationId)
        .input('user_id', sql.Int, userId)
        .input('limit', sql.Int, limit)
        .query(`
          SELECT m.id, m.role, m.content, m.mcp_tool_used, m.sql_query, 
                 m.execution_time_ms, m.created_at
          FROM messages m
          INNER JOIN conversations c ON m.conversation_id = c.id
          WHERE m.conversation_id = @conversation_id 
            AND c.user_id = @user_id 
            AND c.is_active = 1
          ORDER BY m.created_at ASC
          OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY
        `);

      return result.recordset;
    } catch (error) {
      console.error('❌ Error obteniendo mensajes:', error.message);
      throw error;
    }
  }

  async getLastMessagesByConversation(conversationId, userId, count = 10) {
    try {
      const result = await this.pool.request()
        .input('conversation_id', sql.Int, conversationId)
        .input('user_id', sql.Int, userId)
        .input('count', sql.Int, count)
        .query(`
          SELECT TOP(@count) m.id, m.role, m.content, m.mcp_tool_used, m.sql_query, 
                 m.execution_time_ms, m.created_at
          FROM messages m
          INNER JOIN conversations c ON m.conversation_id = c.id
          WHERE m.conversation_id = @conversation_id 
            AND c.user_id = @user_id 
            AND c.is_active = 1
          ORDER BY m.created_at DESC
        `);

      return result.recordset.reverse(); // Ordenar ascendente
    } catch (error) {
      console.error('❌ Error obteniendo últimos mensajes:', error.message);
      throw error;
    }
  }

  // Estadísticas
  async getUserStats(userId) {
    try {
      const result = await this.pool.request()
        .input('user_id', sql.Int, userId)
        .query(`
          SELECT 
            COUNT(DISTINCT c.id) as total_conversations,
            COUNT(m.id) as total_messages,
            COUNT(CASE WHEN m.mcp_tool_used IS NOT NULL THEN 1 END) as tool_usage_count,
            MAX(m.created_at) as last_activity
          FROM conversations c
          LEFT JOIN messages m ON c.id = m.conversation_id
          WHERE c.user_id = @user_id AND c.is_active = 1
        `);

      return result.recordset[0];
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas de usuario:', error.message);
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    try {
      await this.pool.request().query('SELECT 1');
      return true;
    } catch (error) {
      console.error('❌ Health check falló:', error.message);
      return false;
    }
  }
}

export default DatabaseService;
