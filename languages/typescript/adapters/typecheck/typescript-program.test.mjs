import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT, resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import {
  enclosingSymbol,
  formatDiagnostic,
  loadTypeScript,
  nativeProjectTypeScript,
  preEmitDiagnostics,
  withoutProjectRoot,
} from './typescript-program.mjs';

const ASSIGN_NUMBER = "Type 'string' is not assignable to type 'number'.";
const ASSIGN_STRING = "Type 'number' is not assignable to type 'string'.";
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
const UTF16_FILE = 'src/wide.ts';
const STRICT = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: 'ES2022',
  lib: ['ES2022'],
  module: 'ESNext',
};

let root;
let ts;

beforeAll(() => {
  ts = loadTypeScript(PACKAGE_ROOT);
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-typecheck-')));
  mkdirSync(path.join(root, 'src'));
  for (const [file, text] of Object.entries(SOURCES)) writeFileSync(path.join(root, file), text);
  const wide = '\uFEFF// é\nexport const wide: number = "x";\n';
  writeFileSync(path.join(root, UTF16_FILE), Buffer.from(wide, 'utf16le'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(name, compilerOptions, include = ['src']) {
  const configPath = path.join(root, name);
  writeFileSync(configPath, JSON.stringify({ compilerOptions, include }));
  return configPath;
}

async function described(engine, configPath, projectNative) {
  const diagnostics = await preEmitDiagnostics({
    ts,
    engine,
    configPath,
    projectRoot: root,
    projectNative,
  });
  return diagnostics.map((diagnostic) => {
    const located = diagnostic.file !== undefined && diagnostic.start !== undefined;
    return {
      file: diagnostic.file === undefined ? undefined : path.basename(diagnostic.file.fileName),
      code: diagnostic.code,
      symbol: located ? enclosingSymbol(ts, diagnostic.file, diagnostic.start) : undefined,
      position: located
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : undefined,
      message: withoutProjectRoot(formatDiagnostic(ts, diagnostic), root),
    };
  });
}

function finding(file, code, symbol, [line, character], message) {
  return { file, code, symbol, position: { line, character }, message };
}

const SOURCE_FINDINGS = [
  finding('assign.ts', 2322, 'total', [0, 6], ASSIGN_NUMBER),
  finding('assign.ts', 2322, 'label', [1, 6], ASSIGN_STRING),
  finding('assign.ts', 2322, 'other', [1, 31], ASSIGN_STRING),
  finding('bom.ts', 2322, 'marked', [0, 13], ASSIGN_NUMBER),
  finding(
    'chain.ts',
    2322,
    'handler',
    [0, 11],
    "Type '(value: number) => void' is not assignable to type '(value: string) => void'.\n" +
      "  Types of parameters 'value' and 'value' are incompatible.\n" +
      `    ${ASSIGN_NUMBER}`,
  ),
  finding('members.ts', 2322, 'Box.open.inner', [0, 34], ASSIGN_STRING),
  finding('members.ts', 2322, 'Box.size', [0, 55], ASSIGN_NUMBER),
  finding('members.ts', 2304, 'outer.nested', [1, 53], "Cannot find name 'missing'."),
  finding(
    'module.ts',
    2307,
    undefined,
    [0, 21],
    "Cannot find module './does-not-exist' or its corresponding type declarations.",
  ),
  finding('syntax.ts', 1109, undefined, [0, 15], 'Expression expected.'),
  finding('unicode.ts', 2322, 'smile', [1, 13], ASSIGN_NUMBER),
  finding('wide.ts', 2322, 'wide', [1, 13], ASSIGN_NUMBER),
];

function configNote(code, message) {
  return { file: undefined, code, symbol: undefined, position: undefined, message };
}

describe('TypeScript 7 type check', () => {
  it('reports what the project TypeScript reports, in the same order', async () => {
    const configPath = writeConfig('tsconfig.match.json', { ...STRICT, types: ['missing-types'] });

    const native = await described('native', configPath);

    expect(native).toEqual([
      configNote(
        2688,
        "Cannot find type definition file for 'missing-types'.\n" +
          '  The file is in the program because:\n' +
          "    Entry point of type library 'missing-types' specified in compilerOptions",
      ),
      ...SOURCE_FINDINGS,
    ]);
    expect(await described('project', configPath)).toEqual(native);
  });

  it('falls back to the project TypeScript for options TypeScript 7 removed', async () => {
    const configPath = writeConfig('tsconfig.legacy.json', {
      ...STRICT,
      types: [],
      baseUrl: '.',
      importsNotUsedAsValues: 'remove',
    });

    expect(await described('native', configPath)).toEqual([
      configNote(
        5101,
        "Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0. " +
          'Specify compilerOption \'"ignoreDeprecations": "6.0"\' to silence this error.\n' +
          '  Visit https://aka.ms/ts6 for migration information.',
      ),
      ...SOURCE_FINDINGS,
    ]);
  });

  it('reports option errors without a location, as the project TypeScript does', async () => {
    const configPath = writeConfig('tsconfig.options.json', {
      ...STRICT,
      types: [],
      noEmit: false,
      outDir: 'out',
    });

    const native = await described('native', configPath);

    expect(native).toEqual([
      configNote(
        5011,
        "The common source directory of 'tsconfig.options.json' is './src'. The 'rootDir' setting " +
          "must be explicitly set to this or another path to adjust your output's file layout.\n" +
          '  Visit https://aka.ms/ts6 for migration information.',
      ),
      ...SOURCE_FINDINGS,
    ]);
    expect(await described('project', configPath)).toEqual(native);
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
    const outsideRootDir = [...Object.keys(SOURCES), UTF16_FILE].map((file) =>
      configNote(
        6059,
        `File '${file}' is not under 'rootDir' 'lib'. 'rootDir' is expected to contain all source files.\n` +
          '  The file is in the program because:\n' +
          "    Matched by include pattern 'src' in 'tsconfig.rootdir.json'",
      ),
    );

    expect(await described('native', configPath)).toEqual([
      ...outsideRootDir.sort((left, right) => left.message.localeCompare(right.message)),
      ...SOURCE_FINDINGS,
    ]);
  });

  it('rewrites only whole paths under the project root', () => {
    expect(
      withoutProjectRoot(`'${root}/src/a.ts' '${root}' '/mnt${root}/b.ts' '${root}-copy'`, root),
    ).toBe(`'src/a.ts' '.' '/mnt${root}/b.ts' '${root}-copy'`);
  });
});

describe('a project whose own typescript is TypeScript 7', () => {
  const projectNative = resolveTool('typescript-native').root;

  it('type checks with the project compiler and reports what the native engine reports', async () => {
    const configPath = writeConfig('tsconfig.own.json', { ...STRICT, types: ['missing-types'] });

    expect(await described('project', configPath, projectNative)).toEqual(
      await described('native', configPath),
    );
  });

  it('reports removed options as the project compiler does, instead of falling back', async () => {
    const configPath = writeConfig('tsconfig.own-legacy.json', {
      ...STRICT,
      types: [],
      baseUrl: '.',
    });

    expect(await described('native', configPath, projectNative)).toEqual([
      configNote(
        5102,
        "Option 'baseUrl' has been removed. Please remove it from your configuration.\n" +
          '  Use \'"paths": {"*": ["./*"]}\' instead.',
      ),
      ...SOURCE_FINDINGS,
    ]);
  });

  it('fails with the project compiler message when the config cannot be read', async () => {
    const configPath = path.join(root, 'tsconfig.broken.json');
    writeFileSync(configPath, '{ "compilerOptions": { "strict": "yes" } }');

    await expect(described('project', configPath, projectNative)).rejects.toThrow(
      /Compiler option 'strict' requires a value of type boolean/u,
    );
  });

  it('reads source files with the bundled TypeScript API', () => {
    const consumer = path.join(root, 'ts7-consumer');
    mkdirSync(path.join(consumer, 'node_modules'), { recursive: true });
    writeFileSync(path.join(consumer, 'package.json'), '{"name":"ts7-consumer"}');
    symlinkSync(projectNative, path.join(consumer, 'node_modules/typescript'));

    const api = loadTypeScript(consumer);

    expect(nativeProjectTypeScript(consumer)).toBe(realpathSync(projectNative));
    expect(api.version).toBe(resolveTool('typescript-js-api').version);
    expect(nativeProjectTypeScript(PACKAGE_ROOT)).toBeUndefined();
  });
});

describe('the default quality config', () => {
  it('type checks JavaScript sources without trying to emit over them', async () => {
    const project = path.join(root, 'javascript-project');
    mkdirSync(path.join(project, 'src'), { recursive: true });
    writeFileSync(path.join(project, 'src/legacy.cjs'), "'use strict';\nmodule.exports = 1;\n");
    writeFileSync(path.join(project, 'src/plain.js'), 'export const plain = 1;\n');
    const configPath = path.join(project, 'tsconfig.json');
    const defaults = path.join(PACKAGE_ROOT, 'languages/typescript/preset/defaults');
    writeFileSync(
      configPath,
      JSON.stringify({
        extends: path.join(defaults, 'tsconfig.quality.json'),
        compilerOptions: { types: [], lib: ['ES2022'] },
        include: ['src'],
      }),
    );

    for (const engine of ['native', 'project']) {
      const diagnostics = await preEmitDiagnostics({
        ts,
        engine,
        configPath,
        projectRoot: project,
      });
      expect(diagnostics.map(({ code }) => code)).toEqual([]);
    }
  });
});
