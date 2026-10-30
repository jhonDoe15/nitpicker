import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { apiEntry, nativeDiagnostics } from './native-diagnostics.mjs';
import { formatDiagnostic, loadTypeScript } from './typescript-program.mjs';

const SYNC = 'typescript/unstable/sync';
const ASYNC = 'typescript/unstable/async';
const STRICT = { strict: true, noEmit: true, skipLibCheck: true, lib: ['ES2022'] };

let root;
let ts;

beforeAll(() => {
  ts = loadTypeScript();
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-native-diagnostics-')));
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'src/assign.ts'), "export const total: number = 'a';\n");
  writeFileSync(path.join(root, 'src/syntax.ts'), 'const broken = ;\n');
  writeFileSync(
    path.join(root, 'src/exported.ts'),
    'export function sum(left: number, right: number) { return left + right; }\n',
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(name, compilerOptions) {
  const configPath = path.join(root, name);
  writeFileSync(configPath, JSON.stringify({ compilerOptions, include: ['src'] }));
  return configPath;
}

async function checked(entry, configPath, apiRoot) {
  const result = await nativeDiagnostics({ ts, configPath, projectRoot: root, apiRoot, entry });
  return {
    ...result,
    diagnostics: result.diagnostics?.map((diagnostic) => ({
      file: diagnostic.file?.fileName,
      start: diagnostic.start,
      length: diagnostic.length,
      code: diagnostic.code,
      message: formatDiagnostic(ts, diagnostic),
    })),
  };
}

describe('the TypeScript 7 API entry', () => {
  it('talks to tsgo over sync pipes on Node.js only', () => {
    expect(apiEntry({ node: '24.11.0' })).toBe(SYNC);
    expect(apiEntry({ node: '24.2.0', deno: '2.9.6' })).toBe(ASYNC);
    expect(apiEntry({ node: '24.3.0', bun: '1.4.2' })).toBe(ASYNC);
  });

  it('gives Deno and Bun the findings Node.js gets', async () => {
    const configPath = writeConfig('tsconfig.json', {
      ...STRICT,
      types: ['missing-types'],
      declaration: true,
      isolatedDeclarations: true,
    });

    const sync = await checked(SYNC, configPath);

    expect(sync.diagnostics.map(({ code }) => code)).toEqual([2688, 2322, 9013, 9010, 1109]);
    expect(await checked(ASYNC, configPath)).toEqual(sync);
  });

  it('falls back for removed options on every runtime', async () => {
    const configPath = writeConfig('tsconfig.legacy.json', { ...STRICT, types: [], baseUrl: '.' });

    expect(await checked(SYNC, configPath)).toEqual({ unsupported: true, diagnostics: undefined });
    expect(await checked(ASYNC, configPath)).toEqual({ unsupported: true, diagnostics: undefined });
  });

  it("type checks with a project's own TypeScript 7 on every runtime", async () => {
    const configPath = writeConfig('tsconfig.own.json', { ...STRICT, types: [] });
    const own = resolveTool('typescript-native').root;

    const sync = await checked(SYNC, configPath, own);

    expect(sync.diagnostics.map(({ code }) => code)).toEqual([2322, 1109]);
    expect(await checked(ASYNC, configPath, own)).toEqual(sync);
  });
});
