import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/cli.ts', 'src/lib/index.ts'],
  format: ['esm'],
  dts: true, // Generate declaration file (.d.ts)
  sourcemap: true,
  clean: true,
  publicDir: true,
});
