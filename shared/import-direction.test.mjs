import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder } from './filesystem.mjs';

const sharedRoot = import.meta.dirname;
const packageRoot = path.resolve(sharedRoot, '..');

// Static `import ... from 'x'` and `export ... from 'x'` specifiers.
const SPECIFIER =
  /(?:^|\n)\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]|(?<![\w'"-])import\s*['"]([^'"]+)['"]/g;

function sharedModules() {
  return [...filesUnder(sharedRoot)].filter(
    (file) => file.endsWith('.mjs') && !file.endsWith('.test.mjs'),
  );
}

describe('shared layer import direction', () => {
  it('imports only node built-ins and other shared modules (never core/, languages/ or a tool package)', () => {
    const offenders = sharedModules().flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(SPECIFIER)]
        .map((match) => match[1] ?? match[2])
        .filter((specifier) => {
          if (specifier.startsWith('node:')) {
            return false;
          }
          if (!specifier.startsWith('.')) {
            return true;
          }
          const target = path.resolve(path.dirname(file), specifier);
          return path.relative(sharedRoot, target).startsWith('..');
        })
        .map((specifier) => `${path.relative(packageRoot, file)} imports ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });
});
