# 🚀 Deployment en Portainer - MCP EFC Comercial

## 📋 Requisitos Previos

1. **Portainer instalado** y accesible
2. **Acceso SSH** al servidor donde está Portainer
3. **Git** instalado en el servidor
4. **Permisos** para crear stacks en Portainer

---

## 🔧 Configuración Inicial

### 1. Clonar el Repositorio

En el servidor con Portainer:

```bash
cd /opt/portainer-data/stacks
git clone https://github.com/peuscategui/mcpefclocal.git mcp-efc-comercial
cd mcp-efc-comercial
```

### 2. Configurar Variables de Entorno

Crear archivo `.env` en la raíz del proyecto:

```bash
nano .env
```

Agregar:

```env
# OpenAI API Key (CRÍTICO)
OPENAI_API_KEY=tu_api_key_aqui

# Database Configuration (ya configurada)
DB_HOST=192.168.2.18
DB_PORT=1433
DB_NAME=PRUEBA_MCP
DB_USER=MCP
DB_PASSWORD=m_25_9e_pe1_
```

### 3. Configurar Next.js para Standalone

Editar `mcp-server/mcp-client-web/next.config.js`:

```javascript
module.exports = {
  output: 'standalone',
  // ... resto de configuración
}
```

---

## 🐳 Deploy en Portainer

### Opción 1: Usando Git

1. Ir a Portainer → **Stacks** → **Add Stack**
2. Nombre: `mcp-efc-comercial`
3. Método: **Repository**
4. URL: `https://github.com/peuscategui/mcpefclocal.git`
5. Ruta: `/mcp-server`
6. Compose file: `docker-compose-production.yml`
7. Automático Pull: ✅ **ON**
8. Click **Deploy the stack**

### Opción 2: Usando Compose File

1. Ir a Portainer → **Stacks** → **Add Stack**
2. Nombre: `mcp-efc-comercial`
3. Método: **Web editor**
4. Copiar el contenido de `mcp-server/docker-compose-production.yml`
5. Click **Deploy the stack**

---

## 🔍 Verificar Deployment

### Backend (Puerto 3001)

```bash
curl http://192.168.2.18:3001/api/health
```

Deberías ver:
```json
{"status":"ok","timestamp":"2025-01-26T..."}
```

### Frontend (Puerto 3003)

```bash
curl http://192.168.2.18:3003
```

Deberías ver el HTML de la página.

---

## 🎯 URLs del Sistema

- **Frontend Web**: http://192.168.2.18:3003
- **Backend API**: http://192.168.2.18:3001
- **API Health**: http://192.168.2.18:3001/api/health

---

## 🔄 Actualizar el Sistema

### Opción 1: Desde Portainer

1. Ir a **Stacks** → `mcp-efc-comercial`
2. Click **Editor**
3. En "Git settings", click **Pull and redeploy**

### Opción 2: Desde SSH

```bash
cd /opt/portainer-data/stacks/mcp-efc-comercial
git pull
cd mcp-server
docker-compose -f docker-compose-production.yml pull
docker-compose -f docker-compose-production.yml up -d
```

---

## 📊 Monitoreo

### Ver Logs

```bash
# Backend
docker logs mcp-backend -f

# Frontend
docker logs mcp-frontend -f

# Todos
docker-compose -f docker-compose-production.yml logs -f
```

### Ver Estado

```bash
docker-compose -f docker-compose-production.yml ps
```

---

## 🛠️ Troubleshooting

### Backend no responde

```bash
docker logs mcp-backend
```

Verificar:
- ✅ Conexión a BD (192.168.2.18:1433)
- ✅ OPENAI_API_KEY configurada
- ✅ Puerto 3001 expuesto

### Frontend no carga

```bash
docker logs mcp-frontend
```

Verificar:
- ✅ Variable NEXT_PUBLIC_API_URL correcta
- ✅ Backend respondiendo en puerto 3001
- ✅ Puerto 3003 expuesto

### Error de permisos

```bash
# Dar permisos al directorio
chmod -R 755 /opt/portainer-data/stacks/mcp-efc-comercial
```

---

## 🔐 Seguridad

### Variables Sensibles

NUNCA subir `.env` a GitHub. Ya está en `.gitignore`.

### Cambiar Puertos

En `docker-compose-production.yml`:

```yaml
ports:
  - "PUERTO_NUEVO:3003"  # Frontend
  - "PUERTO_NUEVO2:3001" # Backend
```

---

## 📝 Notas Importantes

1. **Base de Datos Externa**: La BD SQL Server está en `192.168.2.18` (no dentro del Docker)
2. **OpenAI API Key**: Es CRÍTICA. Sin ella, el sistema no funcionará
3. **Permisos de BD**: El usuario `MCP` necesita permisos de LECTURA en `Tmp_AnalisisComercial_prueba`
4. **Historial Deshabilitado**: Por falta de permisos de escritura en `conversations` y `messages`

---

## ✅ Checklist de Deployment

- [ ] Repositorio clonado en GitHub
- [ ] OPENAI_API_KEY configurada en `.env`
- [ ] Stack creado en Portainer
- [ ] Backend respondiendo en puerto 3001
- [ ] Frontend cargando en puerto 3003
- [ ] Conexión a BD verificada
- [ ] Test realizado: "ventas del último mes"

---

## 🆘 Soporte

Para problemas:
1. Verificar logs: `docker logs <container>`
2. Verificar red: `docker network ls`
3. Verificar puertos: `netstat -tulpn | grep -E '3001|3003'`

