import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  },
  resolve: {
    alias: {
      // En dehors du runtime Electron, `require('electron')` résout vers le
      // chemin du binaire (string), pas vers { app, ipcMain, ... } — on
      // substitue un stub minimal pour pouvoir importer database.ts sous Vitest.
      electron: path.resolve(__dirname, 'test/mocks/electron.ts')
    }
  }
})
