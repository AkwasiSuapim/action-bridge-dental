// Bundles each Lambda entry point into backend/.build/<name>/index.mjs for SAM to package.
// Workspace packages resolve to their compiled dist/, so run `npm run build` at the root first.
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outRoot = `${root}.build`;
const entries = {
  health: 'src/functions/health.ts',
  cases: 'src/functions/cases.ts',
  calculations: 'src/functions/calculations.ts',
  local: 'src/local/server.ts',
};

for (const [name, entry] of Object.entries(entries)) {
  await rm(`${outRoot}/${name}`, { recursive: true, force: true });
  const result = await build({
    entryPoints: [`${root}${entry}`],
    outfile: `${outRoot}/${name}/index.mjs`,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    minify: name !== 'local',
    sourcemap: true,
    metafile: true,
    // Some AWS SDK dependencies still call require(); provide it inside the ESM bundle.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: 'warning',
  });
  const bytes = Object.values(result.metafile.outputs).reduce((sum, o) => sum + o.bytes, 0);
  console.log(`bundled ${name.padEnd(13)} ${(bytes / 1024).toFixed(0)} KiB`);
}
