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
  }
});