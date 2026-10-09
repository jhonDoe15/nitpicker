import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sharedRoot = import.meta.dirname;
const packageRoot = path.resolve(sharedRoot, '..');

// Static `import ... from 'x'` and `export ... from 'x'` specifiers.
const SPECIFIER =
  /(?:^|\n)\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;

function sharedModules(directory = sharedRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sharedModules(entryPath);
    return entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs') ? [entryPath] : [];
  });
}

describe('shared layer import direction', () => {
  it('imports only node built-ins and other shared modules (never preset/, adapters/, core/ or a tool package)', () => {
    const offenders = sharedModules().flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(SPECIFIER)]
        .map((match) => match[1] ?? match[2])
        .filter((specifier) => {
          if (specifier.startsWith('node:')) return false;
          if (!specifier.startsWith('.')) return true;
          const target = path.resolve(path.dirname(file), specifier);
          return path.relative(sharedRoot, target).startsWith('..');
        })
        .map((specifier) => `${path.relative(packageRoot, file)} imports ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });
});
