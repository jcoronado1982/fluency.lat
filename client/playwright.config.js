import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';

// WebKit móvil aplica controles de acceso distintos a 127.0.0.1; localhost
// conserva el mismo origen local y replica correctamente el flujo del proxy Vite.
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    // Los proyectos comparten el usuario dev-guest y su progreso en SurrealDB local.
    // Un solo worker evita escrituras concurrentes que vuelvan inestable el flujo E2E.
    workers: 1,
    forbidOnly: true,
    retries: 0,
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
    use: {
        baseURL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'desktop-chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'pixel-7',
            use: { ...devices['Pixel 7'] },
        },
        {
            name: 'iphone-14-webkit',
            use: { ...devices['iPhone 14'] },
        },
    ],
});
