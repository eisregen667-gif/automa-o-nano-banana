import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // Caminhos relativos permitem servir o build em subdiretórios (ex: GitHub Pages)
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Separa as libs pesadas do codigo do app: o navegador guarda os
          // vendors em cache e cada atualizacao nossa baixa so o chunk do app
          manualChunks: {
            react: ['react', 'react-dom'],
            genai: ['@google/genai'],
            zip: ['jszip'],
            icons: ['lucide-react'],
          },
        },
      },
    },
  };
});
