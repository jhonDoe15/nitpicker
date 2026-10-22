import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { SUITES, classifyGates, gateCandidates, workflowProblems } from './e2e-gates.mjs';

const ENV = ['process', 'env'].join('.');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function repository(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-e2e-gates-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

describe('the E2E gate candidates', () => {
  it('are the .e2e.test. files and the tests that read a suite flag directly or through an import', () => {
    const root = repository({
      'languages/a/plain.e2e.test.mjs': "it('runs', () => {});\n",
      'languages/a/support.mjs': `export const on = ${ENV}.NITPICKER_JAVA_E2E === '1';\n`,
      'languages/a/gated.test.mjs': "import { on } from './support.mjs';\n",
      'languages/a/unit.test.mjs': "vi.stubEnv('NITPICKER_JAVA_E2E', '1');\n",
      'scripts/typo.test.mjs': `const on = ${ENV}['NITPICKER_JAAVA_E2E'] === '1';\n`,
      'docs/other.test.mjs': `const on = ${ENV}.NITPICKER_JAVA_E2E === '1';\n`,
    });

    expect(gateCandidates(root)).toEqual([
      { file: 'languages/a/gated.test.mjs', flags: ['NITPICKER_JAVA_E2E'] },
      { file: 'languages/a/plain.e2e.test.mjs', flags: [] },
      { file: 'scripts/typo.test.mjs', flags: ['NITPICKER_JAAVA_E2E'] },
    ]);
  });
});

const cases = (file, ...names) => names.map((name) => ({ file, name }));

describe('the E2E gates', () => {
  const candidates = [
    { file: 'java.e2e.test.mjs', flags: ['NITPICKER_JAVA_E2E'] },
    { file: 'helper-gated.test.mjs', flags: ['NITPICKER_JAVA_E2E'] },
    { file: 'kotlin.e2e.test.mjs', flags: [] },
    { file: 'python.e2e.test.mjs', flags: ['NITPICKER_PYTHON_E2E'] },
    { file: 'both.e2e.test.mjs', flags: ['NITPICKER_JAVA_E2E', 'NITPICKER_KOTLIN_E2E'] },
    { file: 'ungated.e2e.test.mjs', flags: [] },
    { file: 'typo.e2e.test.mjs', flags: ['NITPICKER_KOTLN_E2E'] },
    { file: 'foreign.e2e.test.mjs', flags: ['NITPICKER_PYTHON_E2E'] },
  ];
  const ungated = cases('ungated.e2e.test.mjs', 'runs everywhere');
  const listings = {
    baseline: ungated,
    listed: {
      java: [
        ...ungated,
        ...cases('java.e2e.test.mjs', 'a', 'b'),
        ...cases('helper-gated.test.mjs', 'c'),
        ...cases('both.e2e.test.mjs', 'd'),
        ...cases('foreign.e2e.test.mjs', 'e'),
      ],
      kotlin: [
        ...ungated,
        ...cases('kotlin.e2e.test.mjs', 'f'),
        ...cases('both.e2e.test.mjs', 'd'),
      ],
      python: [...ungated, ...cases('python.e2e.test.mjs', 'g')],
    },
  };

  it('report a file under two flags, under none, under a flag no suite sets or under another flag than it reads', () => {
    expect(classifyGates(candidates, listings).problems).toEqual([
      'both.e2e.test.mjs is gated by NITPICKER_JAVA_E2E and NITPICKER_KOTLIN_E2E',
      'ungated.e2e.test.mjs is gated by no suite flag',
      'typo.e2e.test.mjs is gated by no suite flag',
      'typo.e2e.test.mjs reads NITPICKER_KOTLN_E2E, which no suite sets',
      'foreign.e2e.test.mjs reads NITPICKER_PYTHON_E2E but does not list under it',
    ]);
  });

  it('expect each suite to select the files that only its flag gates, whatever their name', () => {
    expect(classifyGates(candidates, listings).expected).toEqual({
      java: [
        'foreign.e2e.test.mjs > e',
        'helper-gated.test.mjs > c',
        'java.e2e.test.mjs > a',
        'java.e2e.test.mjs > b',
      ],
      kotlin: ['kotlin.e2e.test.mjs > f'],
      python: ['python.e2e.test.mjs > g'],
    });
  });
});

function workflow(language) {
  const file = path.join(import.meta.dirname, `../../.github/workflows/${language}-e2e.yml`);
  return parse(readFileSync(file, 'utf8'));
}

describe('the E2E workflows', () => {
  it.each(SUITES)(
    'run the %s shards, its shard plan and an aggregate that checks both',
    (language) => {
      expect(workflowProblems(workflow(language), language)).toEqual([]);
    },
  );

  it('report an aggregate that does not need the plan, and a shard run without --shard', () => {
    const parsed = workflow('python');
    const aggregate = Object.keys(parsed.jobs).find((name) => !name.startsWith('python-shard'));
    parsed.jobs[aggregate].needs = ['python-shard'];
    for (const step of parsed.jobs['python-shard'].steps) {
      step.run = step.run?.replace(/ --shard=\S+/u, '');
    }

    expect(workflowProblems(parsed, 'python')).toEqual([
      'python-shard must run test:python with --shard=${{ matrix.shard }}/${{ strategy.job-total }}',
      'one aggregate job must always run, need python-shard-plan and python-shard and check both results',
    ]);
  });
});
