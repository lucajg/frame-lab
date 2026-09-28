import { defineConfig } from 'vitest/config';
export default defineConfig({ base: './', server: { port: 5173, strictPort: true }, build:{rollupOptions:{output:{manualChunks:{three:['three','three/addons/controls/OrbitControls.js','three/addons/renderers/CSS2DRenderer.js']}}}}, test: { include: ['tests/**/*.test.ts'] } });
