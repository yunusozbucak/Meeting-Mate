import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // This allows process.env.API_KEY to work in the browser code
    // by replacing it with the string value during build time.
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
  },
  server: {
    host: true // Expose to network for local mobile testing
  },
  build: {
    // MediaPipe and AI libraries are large, so we increase the warning limit
    chunkSizeWarningLimit: 1600, 
    rollupOptions: {
      output: {
        // Separate vendor libraries into their own chunks for better caching and performance
        manualChunks: {
          'mediapipe': ['@mediapipe/tasks-vision'],
          'vendor': ['react', 'react-dom', 'lucide-react', 'peerjs'],
          'genai': ['@google/genai']
        }
      }
    }
  }
});