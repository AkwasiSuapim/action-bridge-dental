import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against source; the published packages resolve to their built dist output.
    alias: {
      '@actionbridge/contracts': src('contracts'),
      '@actionbridge/benefits-engine': src('benefits-engine'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'backend/test/**/*.test.ts'],
  },
});
