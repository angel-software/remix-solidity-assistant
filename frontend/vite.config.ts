import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = process.env;
  
  return {
    plugins: [react()],
    server: {
      port: parseInt(env.FRONTEND_PORT || '3000'),
      host: '0.0.0.0'
    }
  }
})
