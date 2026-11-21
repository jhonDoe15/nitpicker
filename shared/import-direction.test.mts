import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder } from './filesystem.mts';

const sharedRoot = import.meta.dirname;
const packageRoot = path.resolve(sharedRoot, '..');

const SPECIFIER =
  /(?:^|\n)\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]|(?<![\w'"-])import\s*\(?\s*['"]([^'"]+)['"]/g;

const TYPE_ONLY_IMPORT = /(?:^|\n)\s*(?:import|export)\s+type\b[^;]*?\bfrom\s*['"][^'"]+['"]/gu;

const LAZY_TOOL_IMPORTS = new Map([['logic/encoding/solver-context.mts', 'z3-solver']]);

function sharedModules(): string[] {
  return [...filesUnder(sharedRoot)].filter(
    (file) =>
      file.endsWith('.mts') &&
      !file.endsWith('.test.mts') &&
      !file.split(path.sep).includes('test-support'),
  );
}

describe('shared layer import direction', () => {
  it('imports only node built-ins and other shared modules outside tests and test-support, and a tool package only as a listed lazy import', () => {
    const offenders = sharedModules().flatMap((file) =>
      [...readFileSync(file, 'utf8').replace(TYPE_ONLY_IMPORT, '').matchAll(SPECIFIER)]
        .map((match) => match[1] ?? match[2] ?? '')
        .filter((specifier) => {
          if (specifier.startsWith('node:')) {
            return false;
          }
          if (
            LAZY_TOOL_IMPORTS.get(path.relative(sharedRoot, file).replaceAll(path.sep, '/')) ===
            specifier
          ) {
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
