/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Deep Studio Dark Theme Palette
        dark: {
          bg: '#090C13',       // Main deep canvas background
          rail: '#0D111A',     // Icon navigation rail
          panel: '#131826',    // Sidebar & cards
          panel2: '#181F30',   // Hover / raised surfaces
          panel3: '#1E273C',   // Input & secondary containers
          border: '#212A3D',   // Crisp dark border
          borderLight: '#2C3750',
        },
        // Vibrant Purple Accent
        primary: {
          DEFAULT: '#7C3AED',
          hover: '#6D28D9',
          active: '#5B21B6',
          light: 'rgba(124, 58, 237, 0.15)',
          border: 'rgba(124, 58, 237, 0.4)',
          50: '#F5F3FF',
          100: '#EDE9FE',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
        },
        surface: {
          DEFAULT: '#131826',
          subtle: '#181F30',
          muted: '#1E273C',
          border: '#212A3D',
        },
        border: '#212A3D',
        'border-strong': '#2C3750',
        'text-primary': '#F8FAFC',
        'text-secondary': '#94A3B8',
        'text-muted': '#64748B',
        'text-on-primary': '#FFFFFF',
        danger: '#EF4444',
        success: '#10B981',
        warning: '#F59E0B',
        // Legacy aliases
        'primary-hover': '#6D28D9',
        'primary-light': 'rgba(124, 58, 237, 0.15)',
        'surface-2': '#0D111A',
        'surface-3': '#181F30',
        ink: '#090C13',
        panel: '#131826',
        panel2: '#181F30',
        line: '#212A3D',
        accent: '#7C3AED',
        accent2: '#8B5CF6',
      },
      fontFamily: {
        display: ['"Inter"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        grotesk: ['"Space Grotesk"', 'sans-serif'],
        montserrat: ['"Montserrat"', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
        card: '0 4px 12px 0 rgba(0, 0, 0, 0.25)',
        cardHover: '0 12px 28px -4px rgba(0, 0, 0, 0.45), 0 0 16px rgba(124, 58, 237, 0.15)',
        modal: '0 25px 60px -12px rgba(0, 0, 0, 0.7)',
        glow: '0 0 20px -4px rgba(124, 58, 237, 0.4)',
        purpleGlow: '0 0 15px rgba(124, 58, 237, 0.35)',
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
}
