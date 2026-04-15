module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // HMS Primary Blue Scale
        primary: {
          50:  '#EBF5FF',
          100: '#D6EBFF',
          200: '#ADD6FF',
          400: '#4DA3FF',
          500: '#2B7FE0',
          600: '#1A5FB0',
          700: '#0D3F80',
        },
        // Surface tokens
        surface: {
          white:   '#FFFFFF',
          bg:      '#F0F6FF',
          sidebar: '#FAFCFF',
        },
        // Neutral scale
        neutral: {
          50:  '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          400: '#94A3B8',
          500: '#64748B',
          700: '#334155',
          900: '#0F172A',
        },
        // Semantic colours
        success: '#10B981',
        warning: '#F59E0B',
        danger:  '#EF4444',
        info:    '#3B82F6',
        purple:  '#8B5CF6',
      },

      fontFamily: {
        sans:    ['Inter', 'Segoe UI', 'sans-serif'],
        heading: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      fontSize: {
        stat: ['32px', { lineHeight: '1.1', fontWeight: '700' }],
      },

      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },

      boxShadow: {
        card:        '0 1px 3px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.06)',
        toast:       '0 8px 24px rgba(0,0,0,0.10)',
        modal:       '0 20px 60px rgba(0,0,0,0.15)',
        primary:     '0 2px 8px rgba(43,127,224,0.30)',
        danger:      '0 2px 8px rgba(239,68,68,0.30)',
      },

      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #2B7FE0 0%, #60A5FA 100%)',
        'gradient-card':    'linear-gradient(180deg, #FFFFFF 0%, #F0F6FF 100%)',
        'shimmer':          'linear-gradient(90deg, #F1F5F9 25%, #F8FAFC 50%, #F1F5F9 75%)',
      },

      animation: {
        shimmer: 'shimmer 1.5s infinite ease-in-out',
        'fade-in': 'fadeIn 0.2s ease',
        'slide-up': 'slideUp 0.3s ease',
        'scale-in': 'scaleIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      },

      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
