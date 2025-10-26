#!/bin/bash
# Script para construir las imágenes Docker antes de desplegar en Portainer

echo "🔨 Construyendo imágenes Docker..."

# Construir imagen MCP SQL Server
echo "📦 Construyendo mcp-sql-server..."
docker build -t mcp-sql-server:latest .

# Construir imagen Backend
echo "📦 Construyendo mcp-backend..."
cd mcp-client-backend
docker build -t mcp-backend:latest .
cd ..

# Construir imagen Frontend
echo "📦 Construyendo mcp-frontend..."
cd mcp-client-web
docker build -t mcp-frontend:latest .
cd ..

echo "✅ Todas las imágenes construidas correctamente"
echo ""
echo "Imágenes disponibles:"
docker images | grep -E "mcp-sql-server|mcp-backend|mcp-frontend"

