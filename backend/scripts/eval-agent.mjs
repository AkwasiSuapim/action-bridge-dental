// Bundles and runs evals/agent-eval.ts (T5-05) against the real Bedrock model.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outfile = `${root}.build/eval/agent-eval.mjs`;
await build({
  entryPoints: [`${root}evals/agent-eval.ts`],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'warning',
});
const run = spawnSync(process.execPath, [outfile], { stdio: 'inherit', cwd: root });
process.exit(run.status ?? 1);
