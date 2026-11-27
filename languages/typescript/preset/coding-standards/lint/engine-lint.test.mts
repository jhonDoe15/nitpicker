import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lintWithEngine } from './engine-lint.mts';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-engine-lint-')));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const file = (name: string) => path.join(root, 'src', name);

function stubEngine(name: string, rows: readonly unknown[], status = 0): string {
  const stub = path.join(root, name);
  writeFileSync(
    stub,
    [
      '#!/bin/sh',
      'while [ $# -gt 0 ]; do',
      '  if [ "$1" = "--out" ]; then out="$2"; fi',
      '  shift',
      'done',
      `echo '${JSON.stringify(rows)}' > "$out"`,
      `exit ${String(status)}`,
    ].join('\n'),
  );
  chmodSync(stub, 0o755);
  return stub;
}

const CONFIGS: Readonly<Record<string, unknown>> = {
  [file('a.ts')]: {
    rules: {
      'nitpicker/no-silent-catch': ['warn'],
      'nitpicker/report-module-load-effects': 2,
      'nitpicker/no-dual-write': 'off',
      'nitpicker/no-double-decode': 'unknown',
    },
  },
  [file('b.ts')]: { rules: { 'nitpicker/no-silent-catch': 'error' } },
  [file('c.ts')]: { rules: { 'nitpicker/no-silent-catch': 'error' } },
  [file('d.ts')]: { rules: {} },
};

function fakeEslint(configs: Readonly<Record<string, unknown>>) {
  return {
    isPathIgnored: (name: string) => Promise.resolve(name.endsWith('ignored.ts')),
    calculateConfigForFile: (name: string): Promise<unknown> => Promise.resolve(configs[name]),
  };
}

const ROWS = [
  [file('a.ts'), 'nitpicker/no-silent-catch', 4, 2, 'later', 4, 9],
  [file('a.ts'), 'nitpicker/no-silent-catch', 4, 1, 'earlier'],
  [
    file('a.ts'),
    'nitpicker/report-module-load-effects',
    1,
    1,
    'loads',
    null,
    null,
    [['not-stylesheet', './a.css']],
  ],
  [
    file('a.ts'),
    'nitpicker/report-module-load-effects',
    2,
    1,
    'effects',
    null,
    null,
    [['not-stylesheet', './a']],
  ],
  [file('a.ts'), 'nitpicker/no-dual-write', 3, 1, 'switched off'],
  [file('c.ts'), '!parse', 1, 1, ''],
];

function request(engine: string, files: readonly string[], configs = CONFIGS) {
  return {
    eslint: fakeEslint(configs),
    root,
    files,
    environment: { ...process.env, NITPICKER_ENGINE: engine },
  };
}

describe.skipIf(process.platform === 'win32')('coding standards linted on the engine', () => {
  const working = stubEngine('working.sh', ROWS);

  it('reports the enabled rules whose conditions hold, in place order, and lists unparsed files', async () => {
    const linted = await lintWithEngine(
      request(working, [
        'src/a.ts',
        'src/b.ts',
        'src/c.ts',
        'src/d.ts',
        'src/ignored.ts',
        'src/a.ts',
      ]),
    );

    expect(linted).toEqual({
      results: [
        {
          filePath: file('a.ts'),
          messages: [
            {
              ruleId: 'nitpicker/report-module-load-effects',
              message: 'effects',
              severity: 2,
              line: 2,
              column: 1,
            },
            {
              ruleId: 'nitpicker/no-silent-catch',
              message: 'earlier',
              severity: 1,
              line: 4,
              column: 1,
            },
            {
              ruleId: 'nitpicker/no-silent-catch',
              message: 'later',
              severity: 1,
              line: 4,
              column: 2,
              endLine: 4,
              endColumn: 9,
            },
          ],
        },
        { filePath: file('b.ts'), messages: [] },
      ],
      unparsed: [file('c.ts')],
    });
  });

  it('gives no answer when the engine fails or is missing', async () => {
    const failing = stubEngine('failing.sh', [], 1);

    expect(await lintWithEngine(request(failing, ['src/b.ts']))).toBeUndefined();
    expect(await lintWithEngine(request(path.join(root, 'missing'), ['src/b.ts']))).toBeUndefined();
  });

  it('leaves the files to ESLint when a rule does not run on the engine', async () => {
    const configs = { [file('b.ts')]: { rules: { eqeqeq: 'error' } } };
    expect(await lintWithEngine(request(working, ['src/b.ts'], configs))).toBeUndefined();
  });

  it('reports nothing when no file has an enabled rule', async () => {
    expect(await lintWithEngine(request(working, ['src/d.ts', 'src/ignored.ts']))).toEqual({
      results: [],
      unparsed: [],
    });
  });
});
