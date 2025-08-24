import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './ui-tests',
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.VITE_APP_URL || 'http://localhost:5173',
    headless: true,
    ignoreHTTPSErrors: true,
  }
})


