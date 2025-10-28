// Servicio para gestión de prompts en base de datos
import sql from 'mssql';

class PromptService {
  constructor(dbPool) {
    this.pool = dbPool;
  }

  /**
   * Obtener prompt activo por tipo y perfil de usuario
   * @param {string} promptType - Tipo de prompt ('analysis', 'sql_generation')
   * @param {string} userProfile - Perfil de usuario ('admin', 'jefe_gi', 'analista', 'gerente')
   * @returns {Promise<string|null>} Contenido del prompt o null
   */
  async getActivePrompt(promptType, userProfile = null) {
    try {
      const result = await this.pool.request()
        .input('prompt_type', sql.VarChar(50), promptType)
        .input('user_profile', sql.VarChar(50), userProfile)
        .query(`
          SELECT TOP 1 p.id, p.name, p.content, p.version, pt.type_name, up.profile_name
          FROM prompts p
          INNER JOIN prompt_types pt ON p.prompt_type_id = pt.id
          LEFT JOIN user_profiles up ON p.user_profile_id = up.id
          WHERE pt.type_name = @prompt_type
            AND (up.profile_name = @user_profile OR p.user_profile_id IS NULL)
            AND p.is_active = 1
          ORDER BY p.user_profile_id DESC, p.version DESC
        `);
      
      return result.recordset[0]?.content || null;
    } catch (error) {
      console.error('❌ Error obteniendo prompt activo:', error.message);
      throw error;
    }
  }

  /**
   * Listar todos los prompts con filtros opcionales
   * @param {string} promptType - Filtrar por tipo de prompt (opcional)
   * @param {string} userProfile - Filtrar por perfil de usuario (opcional)
   * @returns {Promise<Array>} Lista de prompts
   */
  async listPrompts(promptType = null, userProfile = null) {
    try {
      let query = `
        SELECT p.id, p.name, p.content, p.version, p.is_active, 
               p.created_at, p.updated_at,
               pt.type_name, up.profile_name,
               u.name as created_by_name
        FROM prompts p
        INNER JOIN prompt_types pt ON p.prompt_type_id = pt.id
        LEFT JOIN user_profiles up ON p.user_profile_id = up.id
        LEFT JOIN users u ON p.created_by = u.id
        WHERE 1=1
      `;

      const request = this.pool.request();
      
      if (promptType) {
        query += ' AND pt.type_name = @prompt_type';
        request.input('prompt_type', sql.VarChar(50), promptType);
      }
      
      if (userProfile) {
        query += ' AND (up.profile_name = @user_profile OR p.user_profile_id IS NULL)';
        request.input('user_profile', sql.VarChar(50), userProfile);
      }
      
      query += ' ORDER BY pt.type_name, p.user_profile_id, p.version DESC';
      
      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      console.error('❌ Error listando prompts:', error.message);
      throw error;
    }
  }

  /**
   * Crear nuevo prompt (se crea como inactivo por defecto)
   * @param {Object} promptData - Datos del prompt
   * @param {string} promptData.promptType - Tipo de prompt
   * @param {string} promptData.userProfile - Perfil de usuario (opcional, null = todos)
   * @param {string} promptData.name - Nombre del prompt
   * @param {string} promptData.content - Contenido del prompt
   * @param {number} promptData.createdBy - ID del usuario creador
   * @returns {Promise<Object>} ID y versión del prompt creado
   */
  async createPrompt(promptData) {
    try {
      const { promptType, userProfile, name, content, createdBy } = promptData;
      
      const result = await this.pool.request()
        .input('prompt_type', sql.VarChar(50), promptType)
        .input('user_profile', sql.VarChar(50), userProfile || null)
        .input('name', sql.VarChar(255), name)
        .input('content', sql.Text, content)
        .input('created_by', sql.Int, createdBy || null)
        .query(`
          DECLARE @prompt_type_id INT, @user_profile_id INT, @next_version INT;
          
          SELECT @prompt_type_id = id FROM prompt_types WHERE type_name = @prompt_type;
          
          IF @prompt_type_id IS NULL
          BEGIN
            RAISERROR('Tipo de prompt no encontrado', 16, 1);
            RETURN;
          END
          
          IF @user_profile IS NOT NULL
          BEGIN
            SELECT @user_profile_id = id FROM user_profiles WHERE profile_name = @user_profile;
            
            IF @user_profile_id IS NULL
            BEGIN
              RAISERROR('Perfil de usuario no encontrado', 16, 1);
              RETURN;
            END
          END
          
          SELECT @next_version = ISNULL(MAX(version), 0) + 1
          FROM prompts
          WHERE prompt_type_id = @prompt_type_id
            AND ISNULL(user_profile_id, -1) = ISNULL(@user_profile_id, -1);
          
          INSERT INTO prompts (prompt_type_id, user_profile_id, name, content, version, is_active, created_by)
          OUTPUT INSERTED.id, INSERTED.version
          VALUES (@prompt_type_id, @user_profile_id, @name, @content, @next_version, 0, @created_by);
        `);
      
      console.log(`✅ Prompt creado: ID=${result.recordset[0].id}, Versión=${result.recordset[0].version}`);
      return result.recordset[0];
    } catch (error) {
      console.error('❌ Error creando prompt:', error.message);
      throw error;
    }
  }

  /**
   * Activar una versión específica de prompt
   * (El trigger desactivará automáticamente otros prompts del mismo tipo+perfil)
   * @param {number} promptId - ID del prompt a activar
   * @returns {Promise<void>}
   */
  async activatePrompt(promptId) {
    try {
      await this.pool.request()
        .input('prompt_id', sql.Int, promptId)
        .query('UPDATE prompts SET is_active = 1, updated_at = GETDATE() WHERE id = @prompt_id');
      
      console.log(`✅ Prompt activado: ID=${promptId}`);
    } catch (error) {
      console.error('❌ Error activando prompt:', error.message);
      throw error;
    }
  }

  /**
   * Desactivar prompt
   * @param {number} promptId - ID del prompt a desactivar
   * @returns {Promise<void>}
   */
  async deactivatePrompt(promptId) {
    try {
      await this.pool.request()
        .input('prompt_id', sql.Int, promptId)
        .query('UPDATE prompts SET is_active = 0, updated_at = GETDATE() WHERE id = @prompt_id');
      
      console.log(`✅ Prompt desactivado: ID=${promptId}`);
    } catch (error) {
      console.error('❌ Error desactivando prompt:', error.message);
      throw error;
    }
  }

  /**
   * Obtener perfiles de usuario disponibles
   * @returns {Promise<Array>} Lista de perfiles
   */
  async getUserProfiles() {
    try {
      const result = await this.pool.request()
        .query('SELECT id, profile_name, description FROM user_profiles ORDER BY profile_name');
      
      return result.recordset;
    } catch (error) {
      console.error('❌ Error obteniendo perfiles:', error.message);
      throw error;
    }
  }

  /**
   * Obtener tipos de prompt disponibles
   * @returns {Promise<Array>} Lista de tipos
   */
  async getPromptTypes() {
    try {
      const result = await this.pool.request()
        .query('SELECT id, type_name, description FROM prompt_types ORDER BY type_name');
      
      return result.recordset;
    } catch (error) {
      console.error('❌ Error obteniendo tipos de prompt:', error.message);
      throw error;
    }
  }

  /**
   * Obtener detalles de un prompt específico
   * @param {number} promptId - ID del prompt
   * @returns {Promise<Object|null>} Detalles del prompt
   */
  async getPromptById(promptId) {
    try {
      const result = await this.pool.request()
        .input('prompt_id', sql.Int, promptId)
        .query(`
          SELECT p.id, p.name, p.content, p.version, p.is_active,
                 p.created_at, p.updated_at,
                 pt.type_name, pt.description as type_description,
                 up.profile_name, up.description as profile_description,
                 u.name as created_by_name
          FROM prompts p
          INNER JOIN prompt_types pt ON p.prompt_type_id = pt.id
          LEFT JOIN user_profiles up ON p.user_profile_id = up.id
          LEFT JOIN users u ON p.created_by = u.id
          WHERE p.id = @prompt_id
        `);
      
      return result.recordset[0] || null;
    } catch (error) {
      console.error('❌ Error obteniendo prompt por ID:', error.message);
      throw error;
    }
  }
}

export default PromptService;

