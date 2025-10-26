# 🚀 MCP EFC Comercial - Sistema de Análisis Comercial Inteligente

Sistema de análisis comercial con IA para EFC, con capacidad de consultar bases de datos SQL Server mediante MCP (Model Context Protocol) y OpenAI GPT-4.

---

## 📋 Características

- 🤖 **Analista Comercial Senior** con más de 50 años de experiencia virtual
- 📊 **Análisis Estratégico**: Identificación de fugas, tesoros ocultos, alertas críticas
- 🔍 **Clasificación Automática**: RENTABLE, FUGA ESTRATÉGICA, TESORO OCULTO, REVISAR, NEUTRO
- 🎯 **Alertas Inteligentes**: Traslado de ahorro, zona crítica, erosión de margen
- 💼 **Dashboard Ejecutivo**: Visualizaciones adaptativas según el tipo de consulta
- 🔐 **Multi-usuario**: Administrador y Cáceres con historial separado
- 🐳 **Dockerizado**: Listo para producción con Portainer

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (Next.js)                    │
│                      Puerto: 3003                       │
│               http://192.168.2.18:3003                  │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   Backend API (Node.js)                 │
│                      Puerto: 3001                       │
│          http://192.168.2.18:3001/api                   │
└────────────┬──────────────────────┬────────────────────┘
             │                      │
             ▼                      ▼
    ┌─────────────────┐   ┌──────────────────┐
    │  OpenAI GPT-4   │   │  MCP SQL Server  │
    └─────────────────┘   └────────┬─────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │  SQL Server     │
                          │  192.168.2.18   │
                          │  PRUEBA_MCP     │
                          └─────────────────┘
```

---

## 🛠️ Requisitos

- Node.js 18+
- Docker & Docker Compose
- Portainer (opcional)
- SQL Server con acceso a BD `PRUEBA_MCP`
- OpenAI API Key

---

## 🚀 Deployment en Portainer

Ver guía completa: [DEPLOYMENT-PORTAINER.md](mcp-server/DEPLOYMENT-PORTAINER.md)

### Quick Start

```bash
# 1. Clonar repositorio
git clone https://github.com/peuscategui/mcpefclocal.git

# 2. Configurar .env
cd mcp-efc-comercial/mcp-server
cp .env.example .env
nano .env  # Agregar OPENAI_API_KEY

# 3. Deploy en Portainer
# Subir docker-compose-production.yml como stack
```

---

## 📁 Estructura del Proyecto

```
mcpefclocal/
├── mcp-server/
│   ├── mcp-client-backend/    # Backend API
│   │   ├── Dockerfile
│   │   ├── server.js
│   │   ├── routes/
│   │   └── utils/
│   ├── mcp-client-web/          # Frontend
│   │   ├── Dockerfile
│   │   ├── app/
│   │   └── components/
│   └── docker-compose-production.yml
├── DEPLOYMENT-PORTAINER.md
└── README.md
```

---

## 🎯 Uso del Sistema

### 1. Consultas Simples

```
ventas del último mes
ventas de septiembre 2025
ventas del 2025
```

### 2. Análisis Estratégicos

```
analiza las combinaciones comerciales del 2025 e identifica fugas estratégicas
identifica tesoros ocultos en las operaciones
detecta alertas de erosión de margen
```

### 3. Comparativos

```
comparativo 2024 vs 2025
tendencia de ventas por mes
sectores destacados
```

---

## 🔧 Configuración

### Variables de Entorno

```env
# Backend
DB_HOST=192.168.2.18
DB_NAME=PRUEBA_MCP
DB_USER=MCP
DB_PASSWORD=m_25_9e_pe1_
OPENAI_API_KEY=sk-...

# Frontend
NEXT_PUBLIC_API_URL=http://192.168.2.18:3001
```

---

## 📊 Clasificación de Combinaciones

- ✅ **RENTABLE**: Markup > 1.28, Volumen > $10K, Participación > 5%
- 🔴 **FUGA ESTRATÉGICA**: Markup < 1.22, Volumen > $10K
- 💎 **TESORO OCULTO**: Markup > 1.29, Volumen < $5K
- ⚠️ **REVISAR**: Markup entre 1.22 y 1.29
- ⚪ **NEUTRO**: Todo lo demás

---

## 🚨 Alertas Automáticas

- **Traslado de ahorro**: parametro_GEP="SI" y Markup < 1.25
- **Zona crítica**: Rango 1-3 y Markup < 1.25
- **Erosión de margen**: Venta crece, Markup decrece
- **Sector involucionando**: Venta decrece sostenidamente

---

## 👥 Usuarios del Sistema

- **Administrador** (default)
- **Cáceres**

Selecciona el usuario desde el header del frontend.

---

## 📝 Licencia

Propietario - EFC Comercial

---

## 🆘 Soporte

Para problemas o preguntas:
- Ver logs: `docker logs mcp-backend` o `docker logs mcp-frontend`
- Revisar [DEPLOYMENT-PORTAINER.md](mcp-server/DEPLOYMENT-PORTAINER.md)
- Verificar conexión a BD: `telnet 192.168.2.18 1433`

