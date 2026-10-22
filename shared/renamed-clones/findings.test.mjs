import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renamedClones, renamedFindings, withoutRenamedCopies } from './findings.mjs';

const roots = [];

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-renamed-findings-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const CODE = Array.from({ length: 8 }, (_, index) => `total = total + step(${index})`).join('\n');
const clone = (overrides = {}) => ({
  first: { file: 'a.py', line: 1 },
  second: { file: 'b.py', line: 1 },
  fragment: '_ = _ + _ ( 0 )\n',
  lines: 8,
  tokens: 120,
  ...overrides,
});

describe('clones found in normalized sources', () => {
  it('keeps real code, orders the two sides by path and strips the fragment of spaces', () => {
    const root = project({ 'a.py': CODE, 'b.py': CODE });

    const [found] = renamedClones(
      [clone({ first: { file: 'b.py', line: 1 }, second: { file: 'a.py', line: 1 } })],
      { projectRoot: root, syntax: 'python' },
    );

    expect([found.first.file, found.second.file, found.fragment, found.original]).toEqual([
      'a.py',
      'b.py',
      '_=_+_(0)',
      CODE,
    ]);
  });

  it('drops a clone that overlaps its own copy', () => {
    const root = project({ 'a.py': CODE });

    expect(
      renamedClones([clone({ second: { file: 'a.py', line: 5 } })], {
        projectRoot: root,
        syntax: 'python',
      }),
    ).toEqual([]);
  });

  it('keeps two copies in one file that do not overlap', () => {
    const root = project({ 'a.py': `${CODE}\n${CODE}` });

    expect(
      renamedClones([clone({ second: { file: 'a.py', line: 9 } })], {
        projectRoot: root,
        syntax: 'python',
      }),
    ).toHaveLength(1);
  });

  it('drops a clone of declarations only', () => {
    const fields = Array.from({ length: 8 }, (_, index) => `    field${index}: str = ""`).join(
      '\n',
    );
    const root = project({ 'a.py': fields, 'b.py': fields });

    expect(renamedClones([clone()], { projectRoot: root, syntax: 'python' })).toEqual([]);
  });
});

describe('plain clones next to renamed ones', () => {
  const renamed = [
    clone({ first: { file: 'a.py', line: 10 }, second: { file: 'b.py', line: 20 } }),
  ];

  it('drops a plain clone that covers the same two ranges, whichever side is first', () => {
    const plain = [
      clone({ first: { file: 'a.py', line: 12 }, second: { file: 'b.py', line: 18 } }),
      clone({ first: { file: 'b.py', line: 22 }, second: { file: 'a.py', line: 14 } }),
    ];

    expect(withoutRenamedCopies(plain, renamed)).toEqual([]);
  });

  it('keeps a plain clone in other files or other lines', () => {
    const plain = [
      clone({ first: { file: 'a.py', line: 40 }, second: { file: 'b.py', line: 20 } }),
      clone({ first: { file: 'a.py', line: 10 }, second: { file: 'c.py', line: 20 } }),
    ];

    expect(withoutRenamedCopies(plain, renamed)).toEqual(plain);
  });
});

describe('findings for renamed clones', () => {
  it('are a duplicate-clone finding and its size metrics, with an identity of their own', () => {
    const findings = renamedFindings([clone()], 'duplicates');

    expect(findings).toEqual([
      {
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: 'a.py',
        identity: 'renamed:pair:a.py|b.py:fragment:7bdf085b864988493169ca59:occurrence:1',
        message:
          'This code repeats b.py:1 (8 lines). Keep one copy and call it from both places. If the repetition is intended, add a.py or b.py to "exclude" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 1 },
      },
      {
        tool: 'duplicates',
        rule: 'duplicate-clone-size',
        path: 'a.py',
        identity: 'renamed:pair:a.py|b.py:occurrence:1:lines',
        message: 'Duplicate with b.py',
        classification: 'descriptive',
        metric: { name: 'lines', value: 8 },
        location: { line: 1 },
      },
      {
        tool: 'duplicates',
        rule: 'duplicate-clone-size',
        path: 'a.py',
        identity: 'renamed:pair:a.py|b.py:occurrence:1:tokens',
        message: 'Duplicate with b.py',
        classification: 'descriptive',
        metric: { name: 'tokens', value: 120 },
        location: { line: 1 },
      },
    ]);
  });

  it('keep their identity when only the lines move', () => {
    const [moved] = renamedFindings([clone({ first: { file: 'a.py', line: 30 } })], 'duplicates');

    expect(moved.identity).toBe(renamedFindings([clone()], 'duplicates')[0].identity);
  });

  it('point two test files at a helper or a table', () => {
    const isTestFile = (file) => file.startsWith('test/');
    const advice = { isTestFile, text: 'Fold the cases into one table.' };
    const clones = [
      clone({
        first: { file: 'test/a.test.ts', line: 1 },
        second: { file: 'test/b.test.ts', line: 1 },
      }),
      clone({ first: { file: 'src/a.ts', line: 1 }, second: { file: 'test/b.test.ts', line: 1 } }),
    ];

    const found = renamedFindings(clones, 'duplicates', advice).filter(
      ({ classification }) => classification === 'enforceable',
    );

    expect(found.map(({ message }) => message)).toEqual([
      'This code repeats test/b.test.ts:1 (8 lines). Fold the cases into one table. If the repetition is intended, add test/a.test.ts or test/b.test.ts to "exclude" in nitpicker.config.json.',
      'This code repeats test/b.test.ts:1 (8 lines). Keep one copy and call it from both places. If the repetition is intended, add src/a.ts or test/b.test.ts to "exclude" in nitpicker.config.json.',
    ]);
  });
});
