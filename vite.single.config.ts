// Variante « fichier unique » : tout le jeu dans un seul HTML, jouable par simple double-clic.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  publicDir: false,
  build: { outDir: 'dist-single', emptyOutDir: true },
});
