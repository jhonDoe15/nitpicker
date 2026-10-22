import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writeV8Coverage } from './v8-coverage.mjs';

const SOURCE = [
  'export function pick(flag: boolean): number {',
  '  if (flag) {',
  '    return 1;',
  '  }',
  '  return 2;',
  '}',
  '',
].join('\n');

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function scriptCoverage(file, count) {
  const start = SOURCE.indexOf('function');
  const end = SOURCE.lastIndexOf('}') + 1;
  const elseStart = SOURCE.indexOf('  return 2');
  return {
    url: pathToFileURL(file).href,
    functions: [
      {
        functionName: '',
        isBlockCoverage: true,
        ranges: [{ startOffset: 0, endOffset: SOURCE.length, count: 1 }],
      },
      {
        functionName: 'pick',
        isBlockCoverage: true,
        ranges: [
          { startOffset: start, endOffset: end, count },
          { startOffset: elseStart, endOffset: end - 1, count: 0 },
        ],
      },
    ],
  };
}

const KINDS = [
  'export enum Kind {',
  '  A,',
  '}',
  'export function kindName(kind: Kind): string {',
  "  return kind === Kind.A ? 'a' : 'b';",
  '}',
  '',
].join('\n');

const mockedScript = (file) => ({
  url: `${pathToFileURL(file).href}?node-test-mock=0`,
  functions: [
    {
      functionName: '',
      isBlockCoverage: true,
      ranges: [{ startOffset: 0, endOffset: 1, count: 1 }],
    },
  ],
});

function projectWith(processes, extraScripts = () => []) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-v8-'));
  roots.push(root);
  mkdirSync(path.join(root, 'src'));
  mkdirSync(path.join(root, 'v8'));
  const covered = path.join(root, 'src/pick.ts');
  const untouched = path.join(root, 'src/untouched.js');
  writeFileSync(covered, SOURCE);
  writeFileSync(untouched, 'export const sign = (value) => (value > 0 ? 1 : -1);\n');
  writeFileSync(path.join(root, 'src/view.tsx'), 'export const View = () => <p />;\n');
  writeFileSync(path.join(root, 'src/kinds.ts'), KINDS);
  for (const [index, count] of processes.entries()) {
    writeFileSync(
      path.join(root, 'v8', `coverage-${String(index)}.json`),
      JSON.stringify({
        result: [
          scriptCoverage(covered, count),
          { url: 'node:fs', functions: [] },
          ...extraScripts(covered),
        ],
      }),
    );
  }
  return {
    root,
    covered,
    untouched,
    view: path.join(root, 'src/view.tsx'),
    kinds: path.join(root, 'src/kinds.ts'),
  };
}

async function coverageOf(project) {
  const outputFile = path.join(project.root, 'reports/coverage-final.json');
  await writeV8Coverage({
    coverageDirectory: path.join(project.root, 'v8'),
    sourceFiles: [project.covered, project.untouched, project.view, project.kinds],
    outputFile,
  });
  return JSON.parse(readFileSync(outputFile, 'utf8'));
}

describe('V8 coverage as istanbul coverage', () => {
  it('maps the branches of a TypeScript file node ran with its types stripped', async () => {
    const project = projectWith([1]);

    const coverage = await coverageOf(project);

    expect(coverage[project.covered].b).toEqual({ 0: [1, 0] });
    expect(coverage[project.covered].branchMap[0]).toEqual({
      loc: { start: { line: 2, column: 2 }, end: { line: 4, column: null } },
      type: 'if',
      locations: [
        { start: { line: 2, column: 2 }, end: { line: 4, column: null } },
        { start: {}, end: {} },
      ],
      line: 2,
    });
  });

  it('adds up the counts of a file that several test processes loaded', async () => {
    const project = projectWith([1, 2]);

    const coverage = await coverageOf(project);

    expect(coverage[project.covered].b).toEqual({ 0: [3, 0] });
    expect(coverage[project.covered].f).toEqual({ 0: 3 });
  });

  it('reports a source file no test loaded as uncovered and skips files node cannot run', async () => {
    const project = projectWith([1]);

    const coverage = await coverageOf(project);

    expect(coverage[project.untouched].b).toEqual({ 0: [0, 0] });
    expect(Object.keys(coverage)).not.toContain(project.view);
  });

  it('maps a source file no test loaded back through the transform when it has an enum', async () => {
    const project = projectWith([1]);

    const coverage = await coverageOf(project);

    expect(
      Object.values(coverage[project.kinds].fnMap).map(({ name, line }) => [name, line]),
    ).toEqual([
      ['(anonymous_0)', 1],
      ['kindName', 4],
    ]);
    expect(
      Object.values(coverage[project.kinds].branchMap).map(({ type, line }) => [type, line]),
    ).toEqual([['cond-expr', 5]]);
    expect(coverage[project.kinds].b).toEqual({ 0: [0, 0] });
  });

  it('skips the script node:test generates for a mocked module', async () => {
    const project = projectWith([1], (covered) => [mockedScript(covered)]);

    const coverage = await coverageOf(project);

    expect(coverage[project.covered].b).toEqual({ 0: [1, 0] });
    expect(coverage[project.covered].f).toEqual({ 0: 1 });
  });
});
