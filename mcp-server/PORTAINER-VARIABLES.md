# Variables de Entorno para Portainer

## 📋 Variables Requeridas por Servicio

### 🔧 Para TODOS los servicios (mcp-server, mcp-backend, mcp-frontend):

```
MCP_PORT=3000
```

### 🗄️ Para `mcp-server`:

```
DB_HOST=192.168.2.18
DB_PORT=1433
DB_NAME=EFCComercial
DB_USER=sa
DB_PASSWORD=TU_PASSWORD_AQUI
MCP_LISTEN_HOST=0.0.0.0
MCP_PORT=3000
```

### 🔗 Para `mcp-backend`:

```
MCP_HOST=mcp-server
MCP_PORT=3000
OPENAI_API_KEY=sk-proj-TU_API_KEY_DE_OPENAI_AQUI
BACKEND_PORT=3001
```

### 🌐 Para `mcp-frontend`:

```
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://192.168.40.197:3001
FRONTEND_PORT=3003
FRONTEND_HOSTNAME=0.0.0.0
```

---

## 🚀 Cómo Aplicar en Portainer:

1. Ve a tu Stack en Portainer
2. Clic en **"Variables de entorno"**
3. Agrega todas las variables listadas arriba
4. Guarda los cambios
5. Haz **Redeploy** del stack

---

## ✅ Cómo Verificar que Funcionó:

### 1. Verificar logs de `mcp-server`:

Debe mostrar:
```
✅ Servidor MCP escuchando en 0.0.0.0:3000
```

### 2. Verificar logs de `mcp-backend`:

Debe mostrar:
```
✅ Conectado al servidor MCP en mcp-server:3000
```

**NO debe aparecer:**
```
❌ Error de conexión MCP: connect ECONNREFUSED ::1:3000
```

### 3. Probar en el navegador:

Accede a: `http://192.168.40.197:3003`

Debe cargar el frontend sin errores en la consola del navegador.

---

## 📝 Notas Importantes:

- **MCP_HOST** debe ser EXACTAMENTE `mcp-server` (nombre del servicio Docker)
- **MCP_LISTEN_HOST** debe ser `0.0.0.0` para que escuche en todas las interfaces
- **NEXT_PUBLIC_API_URL** es la IP pública donde está el backend (192.168.40.197)
- El backend usa **PORT** (variable `BACKEND_PORT` = 3001)
- El frontend usa **PORT** (variable `FRONTEND_PORT` = 3003)

