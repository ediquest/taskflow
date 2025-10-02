import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoName = 'taskflow'

export default defineConfig({
  plugins: [react()],
  // Dla "project pages":
  base: `/${repoName}/`,

})