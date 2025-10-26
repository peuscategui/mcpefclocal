# MCP Web Client - Cliente Web para Bases de Datos con IA

Un cliente web moderno que permite interactuar con bases de datos SQL Server usando lenguaje natural, integrando OpenAI para procesamiento inteligente de consultas y OAuth2 para autenticación segura.

## 🏗️ Arquitectura

```
[Usuario] → [Next.js Frontend] → [Backend API] → [MCP Server] → [SQL Server]
              (puerto 3002)        (puerto 3001)   (puerto 3000)
                      ↓
                [OpenAI API]
                      ↓
                [OAuth2 Provider]
```

### Componentes

1. **mcp-server**: Servidor MCP TCP existente (ya implementado)
2. **mcp-backend**: API REST con integración OpenAI y OAuth2
3. **mcp-frontend**: Aplicación Next.js con interfaz de chat

## 🚀 Características

- ✅ **Chat Inteligente**: Interfaz estilo ChatGPT para consultas en lenguaje natural
- ✅ **Integración OpenAI**: Function calling para herramientas MCP
- ✅ **Autenticación OAuth2**: Google y Microsoft (opcional)
- ✅ **Historial de Conversaciones**: Gestión completa de conversaciones
- ✅ **Visualización SQL**: Tablas interactivas para resultados
- ✅ **Seguridad**: Solo consultas SELECT permitidas
- ✅ **Reconexión Automática**: Manejo robusto de conexiones
- ✅ **Responsive**: Diseño adaptable a móviles y desktop

## 📋 Prerrequisitos

- Node.js 18+
- Docker y Docker Compose
- SQL Server con base de datos `PRUEBA_MCP`
- Cuenta de OpenAI con API key
- Cuenta de Google para OAuth2

## 🛠️ Instalación

### 1. Configurar Base de Datos

Ejecutar el script SQL para crear las tablas necesarias:

```sql
-- Ejecutar en SQL Server Management Studio
-- Archivo: sql/setup-tables.sql
```

### 2. Configurar Variables de Entorno

```bash
# Copiar archivo de configuración
cp env.full.example .env

# Editar variables de entorno
nano .env
```

Variables importantes:
- `OPENAI_API_KEY`: Tu API key de OpenAI
- `OAUTH_CLIENT_ID`: Client ID de Google OAuth2
- `OAUTH_CLIENT_SECRET`: Client Secret de Google OAuth2
- `SESSION_SECRET`: Clave secreta para sesiones
- `JWT_SECRET`: Clave secreta para JWT

### 3. Configurar Google OAuth2

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear un nuevo proyecto o seleccionar existente
3. Habilitar Google+ API
4. Crear credenciales OAuth2:
   - Tipo: Aplicación web
   - URI de redirección: `http://localhost:3001/api/auth/callback`
5. Copiar Client ID y Client Secret al archivo `.env`

### 4. Despliegue con Docker

```bash
# Construir y ejecutar todos los servicios
docker-compose -f docker-compose-full.yml up --build

# Ejecutar en segundo plano
docker-compose -f docker-compose-full.yml up -d --build
```

### 5. Verificar Despliegue

- **Frontend**: http://localhost:3002
- **Backend API**: http://localhost:3001/health
- **MCP Server**: Puerto 3000 (interno)

## 🧪 Desarrollo Local

### Backend

```bash
cd mcp-client-backend
npm install
cp env.example .env
# Configurar variables de entorno
npm run dev
```

### Frontend

```bash
cd mcp-client-web
npm install
cp .env.local.example .env.local
# Configurar variables de entorno
npm run dev
```

### Servidor MCP

```bash
# Mantener el servidor MCP corriendo
node mcp-tcp-fixed.js
```

## 📖 Uso

### 1. Iniciar Sesión

- Acceder a http://localhost:3002
- Hacer clic en "Continuar con Google"
- Autorizar la aplicación
- Serás redirigido automáticamente

### 2. Hacer Consultas

Ejemplos de consultas en lenguaje natural:

- "¿Qué tablas hay en la base de datos?"
- "Muéstrame la estructura de la tabla usuarios"
- "¿Cuántos productos hay en stock?"
- "Lista todos los usuarios activos"
- "¿Cuáles son las ventas del último mes?"

### 3. Gestionar Conversaciones

- **Nueva conversación**: Botón "+" en el sidebar
- **Cambiar conversación**: Clic en cualquier conversación
- **Editar título**: Botón de editar en el sidebar
- **Eliminar**: Botón de eliminar en el sidebar

## 🔧 API Endpoints

### Autenticación

- `GET /api/auth/urls` - URLs de autenticación
- `GET /api/auth/me` - Información del usuario
- `POST /api/auth/refresh` - Refrescar token
- `POST /api/auth/logout` - Cerrar sesión

### Chat

- `POST /api/chat` - Enviar mensaje
- `GET /api/conversations` - Listar conversaciones
- `GET /api/conversations/:id` - Obtener conversación
- `POST /api/conversations` - Crear conversación

### Herramientas MCP

- `GET /api/tools` - Herramientas disponibles
- `GET /api/tables` - Tablas disponibles
- `GET /api/tables/:name` - Describir tabla

### Health Check

- `GET /api/health` - Estado de servicios

## 🛡️ Seguridad

- **Solo consultas SELECT**: Validación en MCP y backend
- **Autenticación OAuth2**: Obligatoria para todas las operaciones
- **Tokens JWT**: Con expiración configurable
- **Rate limiting**: Protección contra abuso
- **CORS**: Configurado correctamente
- **Sanitización**: Entrada de datos validada

## 📊 Monitoreo

### Health Checks

```bash
# Verificar estado de servicios
curl http://localhost:3001/health
curl http://localhost:3002/
```

### Logs

```bash
# Ver logs de todos los servicios
docker-compose -f docker-compose-full.yml logs -f

# Logs de servicio específico
docker-compose -f docker-compose-full.yml logs -f mcp-backend
```

## 🔍 Solución de Problemas

### Error de Conexión MCP

```bash
# Verificar que el servidor MCP esté corriendo
docker-compose -f docker-compose-full.yml ps mcp-server

# Ver logs del servidor MCP
docker-compose -f docker-compose-full.yml logs mcp-server
```

### Error de Autenticación OAuth2

1. Verificar configuración en Google Cloud Console
2. Comprobar URLs de redirección
3. Verificar variables de entorno

### Error de OpenAI

1. Verificar API key válida
2. Comprobar límites de uso
3. Verificar conectividad de red

### Error de Base de Datos

1. Verificar conectividad a SQL Server
2. Comprobar credenciales
3. Verificar que las tablas existan

## 📈 Escalabilidad

### Horizontal

- Múltiples instancias del backend
- Load balancer para distribución
- Base de datos en cluster

### Vertical

- Aumentar recursos de contenedores
- Optimizar consultas SQL
- Cache de resultados frecuentes

## 🤝 Contribución

1. Fork del repositorio
2. Crear rama de feature
3. Commit de cambios
4. Push a la rama
5. Crear Pull Request

## 📄 Licencia

MIT License - ver archivo LICENSE

## 🆘 Soporte

- **Issues**: GitHub Issues
- **Documentación**: README y comentarios en código
- **Logs**: Docker logs para debugging

## 🔄 Actualizaciones

Para actualizar el sistema:

```bash
# Detener servicios
docker-compose -f docker-compose-full.yml down

# Actualizar código
git pull origin main

# Reconstruir y ejecutar
docker-compose -f docker-compose-full.yml up --build -d
```

---

**Desarrollado con ❤️ usando MCP, OpenAI, Next.js y SQL Server**
