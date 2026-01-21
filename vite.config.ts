import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  // Fix: Cast process to any to avoid TS error 'Property cwd does not exist on type Process'
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Consolidate API keys to process.env.API_KEY to ensure SDK compliance
  const apiKey = env.API_KEY || env.VITE_GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_GEMINI_API_KEY;

  return {
    plugins: [react()],
    define: {
      // Define process.env variables so they are replaced by string values at build time
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY),
      // Fallback object for safety
      'process.env': {} 
    }
  };
});