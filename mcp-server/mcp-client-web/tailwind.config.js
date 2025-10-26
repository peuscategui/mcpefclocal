/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Colores específicos del sistema
        'header': '#2F4050',
        'sidebar-active': '#27ae60',
        'background-main': '#f8f9fc',
        'border-subtle': '#e9ecef',
        'text-secondary': '#6c757d',
        
        // Colores balanceados azul/verde
        'primary-blue': '#2F4050',
        'secondary-blue': '#4a5568',
        'accent-blue': '#2d3748',
        'success-green': '#27ae60',
        'warning-orange': '#f39c12',
        'danger-red': '#e74c3c',
        'info-blue': '#2F4050',
        
        // Colores adicionales para compatibilidad
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        // Tamaños específicos del sistema
        'h1-primary': ['1.875rem', { lineHeight: '1.2', fontWeight: '900' }], // text-3xl font-bold
        'h2-graficos': ['1.25rem', { lineHeight: '1.3', fontWeight: '900' }], // text-xl font-bold
        'valor-grande': ['3rem', { lineHeight: '1', fontWeight: '900' }], // ~48px font-bold
        'titulo-tarjeta': ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }], // text-sm font-medium
        'descripcion': ['0.75rem', { lineHeight: '1.5' }], // text-xs
        'descripcion-pagina': ['1rem', { lineHeight: '1.6' }], // text-base
        'label': ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }], // text-sm font-medium
        'secundario': ['0.875rem', { lineHeight: '1.5' }], // text-sm
        'muy-pequeno': ['0.75rem', { lineHeight: '1.4' }], // text-xs
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
