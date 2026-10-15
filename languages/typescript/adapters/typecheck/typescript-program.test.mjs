import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import {
  enclosingSymbol,
  formatDiagnostic,
  loadTypeScript,
  preEmitDiagnostics,
  withoutProjectRoot,
} from './typescript-program.mjs';

const SOURCES = {
  'src/assign.ts':
    "const total: number = 'a';\nconst label: string = 1; const other: string = 2;\n",
  'src/chain.ts': 'export let handler: (value: string) => void = (value: number) => {};\n',
  'src/members.ts':
    "export class Box { open() { const inner: string = 1; } size: number = 'z'; }\n" +
    'export function outer() { function nested() { return missing; } }\n',
  'src/module.ts': "import { nope } from './does-not-exist';\n",
  'src/unicode.ts': '// é😀\nexport const smile: number = "x";\n',
  'src/bom.ts': '﻿export const marked: number = "x";\n',
  'src/syntax.ts': 'const broken = ;\n',
};
const STRICT = { strict: true, noEmit: true, target: 'ES2022', module: 'ESNext' };

let root;

beforeAll(() => {
  loadTypeScript(PACKAGE_ROOT);
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-typecheck-')));
  mkdirSync(path.join(root, 'src'));
  for (const [file, text] of Object.entries(SOURCES)) writeFileSync(path.join(root, file), text);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(name, compilerOptions, include = ['src']) {
  const configPath = path.join(root, name);
  writeFileSync(configPath, JSON.stringify({ compilerOptions, include }));
  return configPath;
}

async function described(engine, configPath) {
  const diagnostics = await preEmitDiagnostics({ engine, configPath, projectRoot: root });
  return diagnostics.map((diagnostic) => {
    const located = diagnostic.file !== undefined && diagnostic.start !== undefined;
    return {
      file: diagnostic.file === undefined ? undefined : path.basename(diagnostic.file.fileName),
      code: diagnostic.code,
      symbol: located ? enclosingSymbol(diagnostic.file, diagnostic.start) : undefined,
      position: located
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : undefined,
      message: formatDiagnostic(diagnostic),
    };
  });
}

describe('TypeScript 7 type check', () => {
  it('reports what the project TypeScript reports, in the same order', async () => {
    const configPath = writeConfig('tsconfig.match.json', { ...STRICT, types: ['missing-types'] });

    const native = await described('native', configPath);

    expect(native).toEqual(await described('project', configPath));
    expect(native.map(({ code }) => code)).toEqual(expect.arrayContaining([2688, 2307, 1109]));
    expect(native).toContainEqual({
      file: 'chain.ts',
      code: 2322,
      symbol: 'handler',
      position: { line: 0, character: 11 },
      message:
        "Type '(value: number) => void' is not assignable to type '(value: string) => void'.\n" +
        "  Types of parameters 'value' and 'value' are incompatible.\n" +
        "    Type 'string' is not assignable to type 'number'.",
    });
    expect(native.filter(({ file }) => file === 'members.ts').map(({ symbol }) => symbol)).toEqual([
      'Box.open.inner',
      'Box.size',
      'outer.nested',
    ]);
  });

  it('falls back to the project TypeScript for options TypeScript 7 removed', async () => {
    const configPath = writeConfig('tsconfig.legacy.json', {
      ...STRICT,
      types: [],
      baseUrl: '.',
      importsNotUsedAsValues: 'remove',
    });

    const native = await described('native', configPath);

    expect(native).toEqual(await described('project', configPath));
    expect(native.map(({ code }) => code)).toContain(5101);
  });

  it('reports nothing when the config matches no files', async () => {
    const configPath = writeConfig('tsconfig.empty.json', { ...STRICT, types: [] }, ['none']);

    expect(await described('native', configPath)).toEqual([]);
  });

  it('keeps the snapshot folder out of messages, so base and head findings match', async () => {
    const configPath = writeConfig('tsconfig.rootdir.json', {
      ...STRICT,
      types: [],
      rootDir: 'lib',
    });

    const messages = (await described('native', configPath)).map(({ message }) =>
      withoutProjectRoot(message, root),
    );

    expect(messages).toContainEqual(
      expect.stringContaining("File 'src/assign.ts' is not under 'rootDir' 'lib'."),
    );
    expect(messages.join('\n')).not.toContain(root);
  });
});
