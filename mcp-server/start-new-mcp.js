// start-new-mcp.js
console.log('🚀 Iniciando nuevo MCP Server con SDK oficial...');

// Cargar variables de entorno
import dotenv from 'dotenv';
dotenv.config();

console.log('📊 Configuración de BD:');
console.log(`   Servidor: ${process.env.DB_SERVER}`);
console.log(`   Base de datos: ${process.env.DB_NAME}`);
console.log(`   Usuario: ${process.env.DB_USER}`);
console.log('');

// Importar y ejecutar el servidor
import('./mcp-server.js').catch(error => {
  console.error('❌ Error iniciando servidor:', error.message);
  process.exit(1);
});

