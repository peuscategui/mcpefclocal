// Rutas de API para administración de prompts
import express from 'express';

const router = express.Router();
let promptService = null;

/**
 * Inyectar PromptService desde el servidor principal
 * @param {PromptService} service - Instancia de PromptService
 */
export function setPromptService(service) {
  promptService = service;
  console.log('✅ PromptService inyectado en rutas de prompts');
}

// ============================================
// GET /api/prompts - Listar prompts
// ============================================
router.get('/', async (req, res) => {
  try {
    if (!promptService) {
      return res.status(503).json({ 
        success: false, 
        error: 'Servicio de prompts no disponible' 
      });
    }

    const { type, profile } = req.query;
    const prompts = await promptService.listPrompts(type, profile);
    
    res.json({ 
      success: true, 
      prompts,
      count: prompts.length
    });
  } catch (error) {
    console.error('❌ Error en GET /api/prompts:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// GET /api/prompts/active - Obtener prompt activo
// ============================================
router.get('/active', async (req, res) => {
  try {
    if (!promptService) {
      return res.status(503).json({ 
        success: false, 
        error: 'Servicio de prompts no disponible' 
      });
    }

    const { type, profile } = req.query;
    
    if (!type) {
      return res.status(400).json({ 
        success: false, 
        error: 'Parámetro "type" es requerido' 
      });
    }

    const content = await promptService.getActivePrompt(type, profile);
    
    res.json({ 
      success: true, 
      content,
      hasPrompt: content !== null
    });
  } catch (error) {
    console.error('❌ Error en GET /api/prompts/active:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// GET /api/prompts/:id - Obtener prompt por ID
// ============================================
router.get('/:id', async (req, res) => {
  try {
    if (!promptService) {
      return res.status(503).json({ 
        success: false, 
        error: 'Servicio de prompts no disponible' 
      });
    }

    const { id } = req.params;
    const prompt = await promptService.getPromptById(parseInt(id));
    
    if (!prompt) {
      return res.status(404).json({ 
        success: false, 
        error: 'Prompt no encontrado' 
      });
    }

    res.json({ 
      success: true, 
      prompt 
    });
  } catch (error) {
    console.error('❌ Error en GET /api/prompts/:id:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// POST /api/prompts - Crear nuevo prompt
// ============================================
router.post('/', async (req, res) => {
  try {
    if (!promptService) {
      return res.status(503).json({ 
        success: false, 
        error: 'Servicio de prompts no disponible' 
      });
    }

    const { promptType, userProfile, name, content, createdBy } = req.body;
    
    // Validaciones
    if (!promptType || !name || !content) {
      return res.status(400).json({ 
        success: false, 
        error: 'Campos requeridos: promptType, name, content' 
      });
    }

    const result = await promptService.createPrompt({ 
      promptType, 
      userProfile, 
      name, 
      content, 
      createdBy 
    });
    
    res.status(201).json({ 
      success: true, 
      promptId: result.id, 
      version: result.version,
      message: 'Prompt creado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error en POST /api/prompts:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// PUT /api/prompts/:id/activate - Activar prompt
// ============================================
router.put('/:id/activate', async (req, res) => {
  try {
    if (!promptService) {
      return res.status(503).json({ 
        success: false, 
        error: 'Servicio de prompts no disponible' 
      });
    }

    const { id } = req.params;
    await promptService.activatePrompt(parseInt(id));
    
    res.json({ 
      success: true,
      message: 'Prompt activado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error en PUT /api/prompts/:id/activate:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// PUT /api/prompts/:id/deactivate - Desactivar prompt
// ============================================
router.put('/:id/deactivate', async (req, res) => {
  try {
    if (!promptService) {
      return res.status(503).json({ 
        success: false, 
        error: 'Servicio de prompts no disponible' 
      });
    }

    const { id } = req.params;
    await promptService.deactivatePrompt(parseInt(id));
    
    res.json({ 
      success: true,
      message: 'Prompt desactivado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error en PUT /api/prompts/:id/deactivate:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// GET /api/prompts/profiles - Listar perfiles
// ============================================
router.get('/metadata/profiles', async (req, res) => {
  try {
    if (!promptService) {
      return res.status(503).json({ 
        success: false, 
        error: 'Servicio de prompts no disponible' 
      });
    }

    const profiles = await promptService.getUserProfiles();
    
    res.json({ 
      success: true, 
      profiles,
      count: profiles.length
    });
  } catch (error) {
    console.error('❌ Error en GET /api/prompts/metadata/profiles:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// GET /api/prompts/types - Listar tipos de prompt
// ============================================
router.get('/metadata/types', async (req, res) => {
  try {
    if (!promptService) {
      return res.status(503).json({ 
        success: false, 
        error: 'Servicio de prompts no disponible' 
      });
    }

    const types = await promptService.getPromptTypes();
    
    res.json({ 
      success: true, 
      types,
      count: types.length
    });
  } catch (error) {
    console.error('❌ Error en GET /api/prompts/metadata/types:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;

