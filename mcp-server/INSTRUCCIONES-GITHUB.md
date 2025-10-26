# 📤 Instrucciones para Subir a GitHub

## ⚡ Comandos Rápidos

```bash
# 1. Ir a la raíz del proyecto
cd C:\desk

# 2. Inicializar Git (si no lo está)
git init

# 3. Agregar el remoto
git remote add origin https://github.com/peuscategui/mcpefclocal.git

# 4. Agregar todos los archivos
git add .

# 5. Commit inicial
git commit -m "Initial commit: MCP EFC Comercial - Sistema de análisis comercial con IA"

# 6. Push a GitHub
git push -u origin main
```

## 📋 Checklist Antes de Subir

- [x] `.gitignore` creado (ya está)
- [x] `.env` agregado a `.gitignore` (ya está)
- [x] Dockerfiles actualizados (ya están)
- [x] docker-compose-production.yml creado (ya está)
- [x] README.md creado (ya está)
- [x] DEPLOYMENT-PORTAINER.md creado (ya está)

## 🔐 Seguridad

⚠️ **IMPORTANTE**: NO subir:
- Archivos `.env` con API keys
- `node_modules/`
- Archivos de backup
- Logs

✅ **YA configurado** en `.gitignore`

## 🎯 Variables a Configurar en el Servidor

Cuando hagas el deployment en Portainer, configura estas variables en el `.env`:

```env
# CRÍTICO: OpenAI API Key
OPENAI_API_KEY=sk-tu_key_aqui

# Database (ya conocidas)
DB_HOST=192.168.2.18
DB_NAME=PRUEBA_MCP
DB_USER=MCP
DB_PASSWORD=m_25_9e_pe1_
```

## 🚀 Próximos Pasos

1. Ejecuta los comandos de arriba
2. Ve a https://github.com/peuscategui/mcpefclocal
3. Verifica que el código esté subido
4. Configura Portainer con el stack
5. ¡Listo! 🎉

