import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { ENGINE_SWITCH, engineExtraction, readExtraction } from './engine-dependencies.mts';

const hasEngine = findEngine(process.env) !== undefined;
const POLICY_TSCONFIG = path.resolve(
  import.meta.dirname,
  '../../../preset/defaults/tsconfig.quality.json',
);
const EXTRACT = new URL('../extract/', import.meta.resolve('dependency-cruiser'));

const SOURCES: Readonly<Record<string, string>> = {
  'a.ts': [
    '/// <reference path="./globals.d.ts" />',
    '/// <reference types="node" />',
    "import type { Only } from './types';",
    "import { used, unused } from './values';",
    "import { type Shape } from './shapes';",
    "import {} from './empty';",
    "import './side-effect';",
    "import Keys from './keys';",
    "import fs = require('fs');",
    "export * from './everything';",
    "export { type Hidden } from './hidden';",
    "export { shown } from './shown';",
    'type Keyed = { [Keys.name]: string };',
    "export const lazy = () => import('./lazy');",
    "export const loaded = require('./required');",
    "type Imported = import('./imported').Thing;",
    "declare const ambient: typeof import('./ambient');",
    'export const value: Only | Shape | Keyed | Imported = used;',
    '',
  ].join('\n'),
  'b.tsx': [
    "import React from 'react';",
    "import { Thing } from './thing';",
    'export const View = () => <><div /></>;',
    'export type T = Thing;',
    '',
  ].join('\n'),
  'c.js': [
    "import x from './x';",
    "const y = require('./y');",
    "define(['./amd-one', './amd-two'], () => {});",
    "export default import('./z').then(() => x + y);",
    '',
  ].join('\n'),
  'd.ts': "import { a } from './a';\nnamespace Inner { export const b = a; }\n",
  'e.ts': "export = { a: require('./b') };\n",
  'f.ts': "import './a';\nexport = require('./b');\n",
  'g.ts': "import { A } from './a';\nexport = A;\n",
  'h.ts': "import { A } from './a';\nimport B from './b';\nexport = { k: A.k, b: B };\n",
  'i.ts': "import { A } from './a';\ndeclare const x: { [A.k]: number };\nexport const y = x;\n",
  'j.ts': "import { A } from './a';\ndeclare enum F { Y = A.z }\nexport const y = F.Y;\n",
  'k.ts':
    "import { A } from './a';\ndeclare namespace N { const v: { [A.k]: number }; }\nexport const y = N;\n",
  'l.ts':
    "import { A } from './a';\ndeclare class C { [A.k]: number; m(): void }\nexport const y = C;\n",
  'm.ts':
    "import { A } from './a';\ndeclare module 'x' { const v: { [A.k]: number }; }\nexport {};\n",
  'n.ts': "import { A } from './a';\ndeclare global { var v: { [A.k]: number }; }\nexport {};\n",
  'o.ts':
    "import { A } from './a';\nconst x: { [A.k]: number } = { [A.k]: 1 };\nexport const y = x;\n",
  'p.ts': "import { A } from './a';\nclass C { declare [A.k]: number }\nexport const y = C;\n",
  'r.ts':
    "import { A } from './a';\nnamespace N { declare const v: { [A.k]: number }; }\nexport const y = N;\n",
  's.ts': "import { A } from './a';\nenum F { Y = A.z }\nexport const y = F;\n",
  't.ts': "import { A } from './a';\ndeclare enum F { Y = require('./b') }\nexport const y = F;\n",
  'v.ts':
    "import { A } from './a';\nnamespace N { import X = A.B; export const z = 1; }\nexport {};\n",
  'w.ts': "import { A } from './a';\nimport X = A.B;\nexport {};\n",
  'x.ts': "import { A } from './a';\nimport X = A.B;\nexport const y = X;\n",
  'y.ts': "import { A } from './a';\nimport X = A.B;\nimport Y = X.C;\nexport const y = Y;\n",
  'z.ts':
    "import { A } from './a';\nimport X = A.B;\nimport Y = X.C;\nexport const y: Y = null!;\n",
  'v2.ts': "import { A } from './a';\nexport import X = A.B;\n",
  'w2.ts':
    "import { A } from './a';\nnamespace N { export import X = A.B; }\nexport const y = N;\n",
  'u.d.ts': "import { A } from './a';\nexport const y: { [A.k]: number };\nexport = A;\n",
};

const folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-import-extract-'));
for (const [file, text] of Object.entries(SOURCES)) writeFileSync(path.join(folder, file), text);

afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

async function cruiserExtraction(file: string): Promise<unknown> {
  const tsc = await import(new URL('tsc/extract.mjs', EXTRACT).href);
  const acorn = await import(new URL('acorn/extract.mjs', EXTRACT).href);
  const { detectPreCompilationNess } = await import(new URL('helpers.mjs', EXTRACT).href);
  const read = ts.readConfigFile(POLICY_TSCONFIG, ts.sys.readFile).config;
  const tsConfig = ts.parseJsonConfigFileContent(read, ts.sys, folder, {}, POLICY_TSCONFIG);
  const options = {
    baseDir: folder,
    moduleSystems: ['es6', 'cjs', 'tsd', 'amd'],
    exoticRequireStrings: [],
    tsPreCompilationDeps: 'specify',
  };
  return detectPreCompilationNess(
    tsc.extract(options, file, { tsConfig }),
    acorn.extract(options, file, { tsConfig }),
  );
}

describe('import extraction on the engine', () => {
  it.skipIf(!hasEngine).each(Object.keys(SOURCES))(
    'lists the dependencies of %s as dependency-cruiser does',
    async (file) => {
      const { detectPreCompilationNess } = await import(new URL('helpers.mjs', EXTRACT).href);
      const extraction = engineExtraction(
        { baseDirectory: folder, files: [file] },
        { ...process.env, [ENGINE_SWITCH]: 'required' },
      ).get(file);

      expect(extraction).toBeDefined();
      expect(detectPreCompilationNess(extraction?.dependencies, extraction?.kept)).toEqual(
        await cruiserExtraction(file),
      );
    },
  );

  it.skipIf(!hasEngine)('leaves files with an import phase to dependency-cruiser', () => {
    const phased: Readonly<Record<string, string>> = {
      'phased-defer.ts': "import defer * as ns from './a';\nexport const y = ns;\n",
      'phased-source.ts': "import source x from './b';\nexport const y = x;\n",
      'phased-call.ts': "export const y = import.defer('./a');\n",
    };
    for (const [file, text] of Object.entries(phased)) writeFileSync(path.join(folder, file), text);
    const extraction = engineExtraction(
      { baseDirectory: folder, files: Object.keys(phased) },
      { ...process.env, [ENGINE_SWITCH]: 'required' },
    );

    expect(Object.keys(phased).filter((file) => extraction.has(file))).toEqual([]);
  });

  it('reads the engine lines and leaves the unread files to dependency-cruiser', () => {
    const text = [
      JSON.stringify({ file: 'a.ts', dependencies: [['./b', 'import-type-only']], kept: [] }),
      JSON.stringify({ file: 'c.ts', unread: 'a JSX factory pragma' }),
      '',
    ].join('\n');

    expect([...readExtraction(text)]).toEqual([
      [
        'a.ts',
        {
          dependencies: [
            {
              dynamic: false,
              module: './b',
              moduleSystem: 'es6',
              exoticallyRequired: false,
              dependencyTypes: ['type-only', 'import'],
            },
          ],
          kept: [],
        },
      ],
    ]);
  });

  it('checks for the engine when it is required, even with no file to extract', () => {
    const environment = { ...process.env, NITPICKER_ENGINE: 'off', [ENGINE_SWITCH]: 'required' };
    expect(() => engineExtraction({ baseDirectory: folder, files: [] }, environment)).toThrow(
      'no engine binary',
    );
  });

  it('refuses a dependency kind it does not know', () => {
    const text = JSON.stringify({ file: 'a.ts', dependencies: [['./b', 'other']], kept: [] });
    expect(() => readExtraction(text)).toThrow('Unknown engine dependency');
  });
});
