import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** T1-03: the engine stays pure and the contracts stay dependency-light, enforced rather than promised. */
function sources(pkg: string): { file: string; text: string }[] {
  const dir = new URL(`../../${pkg}/src/`, import.meta.url);
  return readdirSync(dir)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => ({ file: `${pkg}/src/${file}`, text: readFileSync(new URL(file, dir), 'utf8') }));
}

function importSpecifiers(text: string): string[] {
  return [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string);
}

describe('module boundaries', () => {
  it('benefits-engine imports only its own modules and @actionbridge/contracts', () => {
    for (const { file, text } of sources('benefits-engine')) {
      for (const specifier of importSpecifiers(text)) {
        expect(specifier.startsWith('./') || specifier === '@actionbridge/contracts', `${file} imports ${specifier}`).toBe(true);
      }
    }
  });

  it('benefits-engine never reads the clock or randomness', () => {
    for (const { file, text } of sources('benefits-engine')) {
      expect(text, file).not.toMatch(/Date\.now|new Date\(|Math\.random|process\.env/);
    }
  });

  it('contracts import only zod and their own modules', () => {
    for (const { file, text } of sources('contracts')) {
      for (const specifier of importSpecifiers(text)) {
        expect(specifier.startsWith('./') || specifier === 'zod', `${file} imports ${specifier}`).toBe(true);
      }
    }
  });
});
