import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { findEngine } from '../../../../shared/engine/engine-binary.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { nativeCompilerPath } from './compiler-binary.mts';
import { runTypedCheckParts, runTypedChecks } from './typed-checks.mts';

const REQUEST = { project: '/nowhere/tsconfig.json', checks: ['public-contracts'] };

it('answers nothing when the typed engine is switched off', () => {
  expect(runTypedChecks({ ...REQUEST, environment: { NITPICKER_TYPED_ENGINE: 'off' } })).toEqual({
    unavailable: 'NITPICKER_TYPED_ENGINE=off',
  });
});

it('answers nothing when there is no engine binary', () => {
  expect(runTypedChecks({ ...REQUEST, environment: { NITPICKER_ENGINE: 'off' } })).toEqual({
    unavailable: 'no engine binary',
  });
});

it('fails when the engine is required and there is no binary', () => {
  const environment = { NITPICKER_ENGINE: 'off', NITPICKER_TYPED_ENGINE: 'required' };

  expect(() => runTypedChecks({ ...REQUEST, environment })).toThrow(
    'NITPICKER_TYPED_ENGINE=required, but there is no engine binary',
  );
});

const FIXTURE = path.resolve(
  import.meta.dirname,
  '../../../../engine/tests/fixtures/typescript-typed/contracts/tsconfig.json',
);
const hasEngine = findEngine(process.env) !== undefined && nativeCompilerPath() !== undefined;

it.runIf(hasEngine)('gets every named check answered by one engine call', () => {
  const outcome = runTypedChecks({
    project: FIXTURE,
    checks: ['public-contracts', 'unused-api'],
    inputs: { 'unused-api': { react: false, files: {} } },
    environment: { ...process.env, NITPICKER_TYPED_ENGINE: 'required' },
  });

  expect(Object.keys(outcome.checks ?? {})).toEqual(['public-contracts', 'unused-api']);
  expect(fieldOf(outcome.checks?.['unused-api'], 'targets')).toEqual([]);
});

it.runIf(hasEngine)(
  'fails when the engine is required and it stops on a check it does not know',
  () => {
    const environment = { ...process.env, NITPICKER_TYPED_ENGINE: 'required' };

    expect(() =>
      runTypedChecks({ project: FIXTURE, checks: ['no-such-check'], environment }),
    ).toThrow(/NITPICKER_TYPED_ENGINE=required, but the engine ended with status 2/u);
  },
);

it.runIf(hasEngine)(
  'reports a project the compiler cannot load as unavailable, also when required',
  () => {
    const project = path.join(path.dirname(FIXTURE), 'missing', 'tsconfig.json');
    const outcome = runTypedChecks({
      project,
      checks: ['public-contracts'],
      environment: { ...process.env, NITPICKER_TYPED_ENGINE: 'required' },
    });

    expect(outcome).toEqual({ unavailable: `types unavailable: ${project} does not exist` });
  },
);

const stubFolder = mkdtempSync(path.join(tmpdir(), 'nitpicker-typed-stub-'));
afterAll(() => {
  rmSync(stubFolder, { recursive: true, force: true });
});

function stubEngine(): string {
  const stub = path.join(stubFolder, 'engine.mjs');
  writeFileSync(
    stub,
    [
      `#!${process.execPath}`,
      "import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';",
      'const args = process.argv.slice(2);',
      'const value = (flag) => args[args.indexOf(flag) + 1];',
      "const checks = value('--checks').split(',');",
      `const calls = ${JSON.stringify(path.join(stubFolder, 'calls.txt'))};`,
      "appendFileSync(calls, `${readFileSync(value('--project'), 'utf8')} ${checks}\\n`);",
      'const answers = Object.fromEntries(checks.map((check) => [check, `answered ${check}`]));',
      "writeFileSync(value('--out'), JSON.stringify({ checks: answers }));",
    ].join('\n'),
  );
  chmodSync(stub, 0o755);
  return stub;
}

it.runIf(process.platform !== 'win32' && nativeCompilerPath() !== undefined)(
  'runs the parts of one project in one engine call and answers each part',
  () => {
    const parts = [
      { check: 'public-contracts', input: {}, project: { files: ['a.ts'] } },
      { check: 'unused-api', input: { react: false }, project: { files: ['b.ts'] } },
      { check: 'unused-api', input: { react: true }, project: { files: ['a.ts'] } },
    ];
    const answers = runTypedCheckParts(parts, { NITPICKER_ENGINE: stubEngine() });

    expect(answers).toEqual([
      'answered public-contracts',
      'answered unused-api',
      'answered unused-api',
    ]);
    expect(readFileSync(path.join(stubFolder, 'calls.txt'), 'utf8').trim().split('\n')).toEqual([
      '{"files":["a.ts"]} public-contracts,unused-api',
      '{"files":["b.ts"]} unused-api',
    ]);
  },
);
