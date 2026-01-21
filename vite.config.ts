import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // aggressively search for the API key in various common environment variables
  const apiKey = 
    process.env.API_KEY || 
    process.env.VITE_GEMINI_API_KEY || 
    process.env.VITE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    env.API_KEY || 
    env.VITE_GEMINI_API_KEY || 
    env.VITE_API_KEY ||
    env.GEMINI_API_KEY ||
    '';

  return {
    plugins: [react()],
    define: {
      // Injects the key specifically as process.env.API_KEY
      'process.env.API_KEY': JSON.stringify(apiKey),
      // Polyfills process.env to empty object to prevent "process is not defined" crashes
      'process.env': JSON.stringify({ API_KEY: apiKey }),
    }
  };
});