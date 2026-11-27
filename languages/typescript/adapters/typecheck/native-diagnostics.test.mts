import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type TypeScript from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mts';
import { apiEntry, nativeDiagnostics, ownNativeDiagnostics } from './native-diagnostics.mts';
import { formatDiagnostic, loadTypeScript } from './typescript-program.mts';

const SYNC = 'typescript/unstable/sync';
const ASYNC = 'typescript/unstable/async';
const STRICT = { strict: true, noEmit: true, skipLibCheck: true, lib: ['ES2022'] };

let root: string;
let ts: typeof TypeScript;

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

function writeConfig(name: string, compilerOptions: Record<string, unknown>): string {
  const configPath = path.join(root, name);
  writeFileSync(configPath, JSON.stringify({ compilerOptions, include: ['src'] }));
  return configPath;
}

async function checked(entry: string | undefined, configPath: string, apiRoot?: string) {
  const request = { ts, configPath, projectRoot: root, ...(entry === undefined ? {} : { entry }) };
  const result = await (apiRoot === undefined
    ? nativeDiagnostics({ ...request, engineHint: false })
    : ownNativeDiagnostics({ ...request, apiRoot }));
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

    expect((sync.diagnostics ?? []).map(({ code }) => code)).toEqual([
      2688, 2322, 9013, 9010, 1109,
    ]);
    expect(await checked(ASYNC, configPath)).toEqual(sync);
    expect(await checked(undefined, configPath)).toEqual(sync);
  });

  it('falls back for removed options on every runtime', async () => {
    const configPath = writeConfig('tsconfig.legacy.json', { ...STRICT, types: [], baseUrl: '.' });

    expect(await checked(SYNC, configPath)).toEqual({ unsupported: true, diagnostics: undefined });
    expect(await checked(ASYNC, configPath)).toEqual({ unsupported: true, diagnostics: undefined });
  });

  it("type checks with a project's own TypeScript 7 on every runtime", async () => {
    const configPath = writeConfig('tsconfig.own.json', { ...STRICT, types: [] });
    const own = resolveTool('@typescript/native').root;

    const sync = await checked(SYNC, configPath, own);

    expect((sync.diagnostics ?? []).map(({ code }) => code)).toEqual([2322, 1109]);
    expect(await checked(ASYNC, configPath, own)).toEqual(sync);
  });
});

const FAKE_APIS: Readonly<Record<string, string>> = {
  'fails-to-start.mjs': [
    'export class API {',
    "  ensureInitialized() { throw new Error('no compiler'); }",
    '  close() {}',
    '}',
  ].join('\n'),
  'opens-nothing.mjs': [
    'export class API {',
    '  ensureInitialized() {}',
    '  close() {}',
    '  updateSnapshot() { return { getProjects: () => [] }; }',
    '}',
  ].join('\n'),
  'loses-the-scope.mjs': [
    'const none = () => [];',
    'const program = {',
    '  getSyntacticDiagnostics: none, getGlobalDiagnostics: none, getBindDiagnostics: none,',
    '  getSemanticDiagnostics: none, getDeclarationDiagnostics: none,',
    '  getConfigFileParsingDiagnostics: none, getProgramDiagnostics: none,',
    "  getSourceFileNames: () => ['src/a.ts'],",
    '};',
    'export class API {',
    '  ensureInitialized() {}',
    '  close() {}',
    '  updateSnapshot({ openProjects: [configFileName] }) {',
    '    const other = `${configFileName}.other`;',
    "    const opened = { configFileName: other, program, compilerOptions: {}, rootFiles: ['src/a.ts'] };",
    '    return { getProjects: () => [opened] };',
    '  }',
    '}',
  ].join('\n'),
};

describe('TypeScript 7 APIs that do not answer', () => {
  let apis: string;

  beforeAll(() => {
    apis = path.join(root, 'apis');
    mkdirSync(apis);
    writeFileSync(path.join(apis, 'package.json'), '{"name":"fake-api","type":"module"}');
    for (const [name, text] of Object.entries(FAKE_APIS))
      writeFileSync(path.join(apis, name), text);
  });

  function request(name: string) {
    const configPath = writeConfig('tsconfig.fake.json', STRICT);
    return { ts, configPath, projectRoot: root, entry: path.join(apis, name) };
  }

  it('leaves the bundled compiler unsupported when it does not start', async () => {
    const outcome = await nativeDiagnostics({ ...request('fails-to-start.mjs'), engineHint: true });
    expect(outcome).toEqual({ unsupported: true, cause: new Error('no compiler') });
  });

  it("stops when the project's own compiler does not start", async () => {
    await expect(
      ownNativeDiagnostics({ ...request('fails-to-start.mjs'), apiRoot: apis }),
    ).rejects.toThrow("The project's TypeScript 7 compiler did not start: no compiler.");
  });

  it('points at the project engine only when the bundled compiler opens no project', async () => {
    const failure = 'TypeScript 7 type check failed: TypeScript 7 opened no project';

    await expect(
      nativeDiagnostics({ ...request('opens-nothing.mjs'), engineHint: true }),
    ).rejects.toThrow(/opened no project for .*\n.*"engine": "project"/su);
    await expect(
      nativeDiagnostics({ ...request('opens-nothing.mjs'), engineHint: false }),
    ).rejects.toThrow(new RegExp(`^${failure} for [^\n]*$`, 'u'));
    await expect(
      ownNativeDiagnostics({ ...request('opens-nothing.mjs'), apiRoot: apis }),
    ).rejects.toThrow(new RegExp(`^${failure} for [^\n]*$`, 'u'));
  });

  it('lists no program files when the scoped config opens no matching project', async () => {
    const scoped = writeConfig('tsconfig.scoped.json', STRICT);
    const outcome = await nativeDiagnostics({
      ...request('loses-the-scope.mjs'),
      engineHint: false,
      scopedConfigPath: scoped,
    });

    expect(outcome).toEqual({ diagnostics: [], files: undefined });
  });
});
