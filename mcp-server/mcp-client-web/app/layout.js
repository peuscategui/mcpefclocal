import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'MCP EFC Comercial',
  description: 'Sistema comercial para análisis de datos usando lenguaje natural',
  keywords: ['MCP', 'EFC', 'Comercial', 'SQL', 'OpenAI', 'Database', 'Analytics'],
  authors: [{ name: 'MCP EFC Team' }],
  viewport: 'width=device-width, initial-scale=1',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#2F4050',
              color: '#fff',
              fontFamily: 'Inter, system-ui, sans-serif',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#27ae60',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#dc3545',
                secondary: '#fff',
              },
            },
          }}
        />
      </body>
    </html>
  );
}
