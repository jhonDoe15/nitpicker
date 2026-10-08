import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { write } from '../lib/consumer.mjs';
import { loadTree } from '../detectors/tree.mjs';
import { copiedWorkdir, listCases, loadCase, runCase } from '../runner/run-case.mjs';

const casesDirectory = import.meta.dirname;
const packageRoot = path.resolve(casesDirectory, '..', '..', 'typescript');
const strictCleanRoot = path.join(packageRoot, 'preset', 'fixtures', 'strict-clean');
const referenceAgent = path.join(casesDirectory, '..', 'runner', 'reference-agent.mjs');
// The full gate includes mutation testing and takes minutes per case, so the default run uses the
// static analyzers only. NITPICKER_EVAL_FULL_GATE=1 runs every analyzer, as the strict-clean
// fixture test does.
const QUICK_ANALYZERS = [
  'eslint-lint',
  'eslint-errors',
  'eslint-logging',
  'eslint-module-effects',
  'entry-points',
  'prettier-format',
  'typescript-typecheck',
  'dependency-architecture',
  'coding-standards',
  'coupling',
  'structure',
  'duplicates',
  'dead-code',
];
const analyzerArguments =
  process.env.NITPICKER_EVAL_FULL_GATE === '1'
    ? []
    : QUICK_ANALYZERS.flatMap((name) => ['--analyzer', name]);
const CASE_TIMEOUT_MS = 600_000;

// Fixture files a case may extend beyond strict-clean (the bug case wires its buggy function).
const EXTENDED_BY_CASE = new Set([
  'src/main/composition-root.ts',
  'src/main/features/greeting/index.ts',
]);

const POSITIVE_CASES = ['add-farewell-feature', 'fix-count-bug', 'add-greet-endpoint'];

// The fixture installed as a consumer would have it, except that the dependencies are the ones
// already in typescript/node_modules (no install, no network). The real gate then runs against it.
function linkedWorkdir() {
  const prepare = copiedWorkdir();
  return ({ caseDefinition, workdir }) => {
    write(workdir, '.gitignore', 'node_modules/\nreports/\n');
    write(
      workdir,
      'package.json',
      readFileSync(path.join(strictCleanRoot, 'package.json'), 'utf8'),
    );
    symlinkSync(path.join(packageRoot, 'node_modules'), path.join(workdir, 'node_modules'));
    prepare({ caseDefinition, workdir });
  };
}

function runReference(caseId) {
  return runCase({
    caseDefinition: loadCase(path.join(casesDirectory, caseId)),
    agentCommand: ['node', referenceAgent],
    prepareWorkdir: linkedWorkdir(),
    gateCommand: [
      'node',
      path.join(packageRoot, 'core', 'cli.mjs'),
      '--base',
      'main',
      ...analyzerArguments,
    ],
    tier: 'reference',
    model: 'reference-solution',
    nitpickerVersion: '0.0.0',
  });
}

describe('positive case definitions', () => {
  it('lists at least three positive cases besides the trivial runner case', () => {
    const ids = listCases(casesDirectory).map((entry) => entry.id);
    expect(ids).toEqual(expect.arrayContaining(POSITIVE_CASES));
  });

  for (const caseId of POSITIVE_CASES) {
    describe(caseId, () => {
      const definition = loadCase(path.join(casesDirectory, caseId));

      it('pins a preset version and has a prompt that names the gate and the test file', () => {
        expect(definition.pin.presetVersion).toBe('0.0.0');
        expect(definition.prompt).toContain('nitpicker-gate');
        expect(definition.prompt).toMatch(/test\/[\w-]+\.test\.ts/);
      });

      it('starts from the strict-clean fixture and changes only what the case needs', () => {
        const strict = loadTree(strictCleanRoot);
        strict.delete('package.json');
        const fixture = loadTree(definition.fixtureDirectory);
        for (const [file, text] of strict) {
          const same = fixture.get(file) === text;
          const extended = EXTENDED_BY_CASE.has(file);
          expect(same || extended, `${file} differs from strict-clean`).toBe(true);
        }
      });

      it('keeps the hidden acceptance tests and the reference out of the agent copy', () => {
        const fixture = loadTree(definition.fixtureDirectory);
        const acceptance = loadTree(definition.acceptanceDirectory);
        expect(acceptance.size).toBeGreaterThan(0);
        for (const file of acceptance.keys()) {
          expect(fixture.has(file), `${file} must not ship in the fixture`).toBe(false);
        }
        expect(existsSync(path.join(definition.directory, 'reference'))).toBe(true);
        for (const file of fixture.keys()) {
          expect(file).not.toMatch(/acceptance|reference/);
        }
      });
    });
  }
});

describe('the reference solutions pass the runner checks (no model calls)', () => {
  for (const caseId of POSITIVE_CASES) {
    it(
      `${caseId}: gate clean, acceptance tests pass, no shortcuts`,
      () => {
        const record = runReference(caseId);
        expect(record.acceptance.passed, record.acceptance.output).toBe(true);
        expect(record.gate.final.exit, record.gate.final.output).toBe(0);
        expect(record.gate.iterations).toBe(1);
        expect(record.gate.iterationsToGreen).toBe(1);
        expect(record.shortcuts).toEqual([]);
        expect(record.detectorErrors).toEqual([]);
        expect(record.outcome).toBe('passed');
        expect(record.passed).toBe(true);
      },
      CASE_TIMEOUT_MS,
    );
  }

  it(
    'fails the acceptance tests of every case for an agent that changes nothing',
    () => {
      for (const caseId of POSITIVE_CASES) {
        const record = runCase({
          caseDefinition: loadCase(path.join(casesDirectory, caseId)),
          agentCommand: 'cat > /dev/null',
          prepareWorkdir: linkedWorkdir(),
          gateCommand: ['node', '-e', 'process.exit(0)'],
          tier: 'reference',
          nitpickerVersion: '0.0.0',
        });
        expect(record.outcome, caseId).toBe('acceptance-failed');
      }
    },
    CASE_TIMEOUT_MS,
  );
});
