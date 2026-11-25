import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { readLayout } from '../../head-policy.mts';
import { analyzeProductionFiles } from '../analyze.mts';
import { productionFacts } from '../reuse/project-files.mts';
import type { ReuseFact } from '../reuse/typed/reuse-types.mts';
import { engineMetrics } from './engine-metrics.mts';
import { writeProjectFiles } from '../../test-support/temporary-projects.mts';
import { engineReuseFacts, resolvedUnits } from './engine-reuse.mts';

const ENGINE = { ...process.env, NITPICKER_STRUCTURE_ENGINE: 'required' };
const NODE = { ...process.env, NITPICKER_STRUCTURE_ENGINE: 'off' };
const hasEngine = findEngine(process.env) !== undefined;

const SOURCES: Readonly<Record<string, string>> = {
  'src/a.ts': [
    "import Default, { helper as renamed, type Shape } from './b';",
    "import * as everything from 'some-package';",
    'export function first(shape: Shape): number {',
    '  if (shape.size > 1) {',
    '    return renamed(shape.size) + everything.count + Default;',
    '  }',
    '  return 0;',
    '}',
    'export class Box {',
    '  constructor(private readonly size: number) {}',
    '  get area(): number {',
    '    return this.size * this.size;',
    '  }',
    '}',
    '',
  ].join('\n'),
  'src/b.tsx': [
    'export type Shape = { size: number };',
    'export const helper = (value: number) => value * 2;',
    'export default 3;',
    'export const View = () => <div>{helper(1)}</div>;',
    "export const lazy = () => import('./a');",
    '',
  ].join('\n'),
  'src/legacy.js': '<!-- an old comment\nfunction kept(a, b) {\n  return a + b;\n}\n',
  'src/broken.ts': 'export function open( {\n',
  'src/octal.ts': 'var a = 010;\nexport function f(b: number) {\n  return a + b;\n}\n',
  'src/escape.mts': 'export const s = "\\07";\nexport function g() {\n  return s;\n}\n',
  'src/sloppy.js': 'var a = 08;\nfunction h() {\n  return "\\8" + a;\n}\n',
  'src/types.d.ts': 'export declare function declared(a: number): void;\n',
  'src/tab\tname.ts': 'export const named = (a: number) => a;\n',
};

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'nitpicker-structure-engine-'));
  writeProjectFiles(root, SOURCES);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function comparable(facts: readonly ReuseFact[]): unknown {
  return JSON.parse(
    JSON.stringify(
      facts.map(({ definitions, jsxTags, ...fact }) => ({
        ...fact,
        definitions: definitions.map(({ name, kind, text, tokens, usedLocally }) => ({
          name,
          kind,
          text,
          tokens,
          usedLocally,
        })),
        jsxTags: [...jsxTags].toSorted(),
      })),
    ),
  );
}

function resolvedNames(facts: readonly ReuseFact[]): string[] {
  const names = JSON.stringify(facts).match(/"[^"]*->[^"]*"/gu) ?? [];
  return [...new Set(names.map((quoted) => quoted.slice(1, -1)))].toSorted();
}

function facts(environment: NodeJS.ProcessEnv): ReuseFact[] {
  return productionFacts(root, {
    layout: readLayout({}),
    moduleOf: (specifier, file) => `${file}->${specifier}`,
    environment,
  });
}

describe.runIf(hasEngine)('structure facts from the engine', () => {
  it('gives the metrics the Node analyzer gives, falling back to it where the engine cannot read', () => {
    const fromEngine = analyzeProductionFiles(path.join(root, 'src'), 'src', {
      environment: ENGINE,
    });
    const fromNode = analyzeProductionFiles(path.join(root, 'src'), 'src', { environment: NODE });

    expect(fromEngine).toEqual(fromNode);
    expect(fromEngine.unparsed.map(({ file }) => file)).toEqual([
      'src/broken.ts',
      'src/escape.mts',
      'src/legacy.js',
      'src/octal.ts',
    ]);
  });

  it('gives the reuse facts the Node analyzer gives, with imported names resolved by the caller', () => {
    const fromEngine = facts(ENGINE);

    expect(comparable(fromEngine)).toEqual(comparable(facts(NODE)));
    expect(resolvedNames(fromEngine)).toEqual([
      'src/a.ts->./b#default',
      'src/a.ts->./b#helper',
      'src/a.ts->some-package#*',
    ]);
  });

  it('resolves the names of a unit with very many children', () => {
    const wide = path.join(root, 'wide.ts');
    const elements = Array.from({ length: 150_000 }, () => 'h').join(', ');
    writeFileSync(
      wide,
      `import { h } from './b';\nexport function wide() {\n  return [${elements}];\n}\n`,
    );
    const fact = engineReuseFacts([{ path: wide, display: 'wide.ts' }], ENGINE)?.get('wide.ts');

    expect(
      fact === undefined ? 0 : resolvedUnits(fact, (specifier) => `x${specifier}`).length,
    ).toBe(1);
  });

  it('leaves files it cannot list or read to the Node analyzer', () => {
    const listed = ['src/legacy.js', 'src/tab\tname.ts', 'src/gone.ts', 'src/a.ts'].map((file) => ({
      path: path.join(root, file),
      display: file,
    }));

    expect([...(engineReuseFacts(listed, ENGINE)?.keys() ?? [])]).toEqual(['src/a.ts']);
    expect(engineMetrics(listed, ENGINE)?.analysisOf('src/legacy.js')).toBeUndefined();
    expect(engineMetrics(listed, ENGINE)?.analysisOf('src/gone.ts')).toBeUndefined();
  });
});

describe('structure facts without the engine', () => {
  const listed = [{ path: '/nowhere/a.ts', display: 'a.ts' }];

  it('answers nothing when switched off', () => {
    expect(engineMetrics(listed, NODE)).toBeUndefined();
  });

  it('answers nothing without a binary, and fails when the engine is required', () => {
    expect(engineReuseFacts(listed, { NITPICKER_ENGINE: 'off' })).toBeUndefined();
    expect(() =>
      engineReuseFacts(listed, { NITPICKER_ENGINE: 'off', NITPICKER_STRUCTURE_ENGINE: 'required' }),
    ).toThrow('NITPICKER_STRUCTURE_ENGINE=required, but there is no engine binary');
  });
});
