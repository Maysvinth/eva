import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Cast process to any to avoid TS errors regarding 'cwd' if node types aren't fully loaded.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Consolidate API keys: Prioritize System/Vercel env vars, then .env file vars
  const apiKey = process.env.API_KEY || process.env.VITE_GEMINI_API_KEY || env.API_KEY || env.VITE_GEMINI_API_KEY || '';

  return {
    plugins: [react()],
    define: {
      // Explicitly define string replacements for the specific keys
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.VITE_GEMINI_API_KEY': JSON.stringify(apiKey),
      // Polyfill the process.env object for broader compatibility to prevent "process is not defined"
      'process.env': JSON.stringify({
        API_KEY: apiKey,
        VITE_GEMINI_API_KEY: apiKey,
        NODE_ENV: mode,
      })
    }
  };
});