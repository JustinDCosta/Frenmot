
        tailwind.config = {
            darkMode: 'class',
            theme: { 
                extend: { 
                    colors: { primary: '#6366f1', primaryHover: '#4f46e5', darkBg: '#0f172a', darkCard: '#1e293b' },
                    keyframes: {
                        fadeInUp: {
                            '0%': { opacity: '0', transform: 'translateY(15px)' },
                            '100%': { opacity: '1', transform: 'translateY(0)' }
                        }
                    },
                    animation: {
                        'fade-in-up': 'fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards'
                    }
                } 
            }
        }
    