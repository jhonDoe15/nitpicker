import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDetectorRegistry } from './detectors.mjs';
import { renderMarkdown } from './report.mjs';
import { isStale, listCases, loadCase, referenceTree, runCase } from './run-case.mjs';
import { packNitpicker } from '../lib/consumer.mjs';
import { copiedWorkdir, installedWorkdir } from '../lib/workdirs.mjs';

const casesDirectory = path.join(import.meta.dirname, '..', 'cases');
const here = (file) => path.join(import.meta.dirname, file);
const fakeAgent = () => ['node', here('fake-agent.mjs')];
const fakeGate = ['node', here('fake-gate.mjs')];
// An agent that changes nothing. It reads its prompt, as a real agent does, so the runner never
// hits EPIPE writing to it.
const doesNothing = ['sh', '-c', 'cat > /dev/null'];

// Every run starts from the same fixture repository. Building it once and copying it per run
// saves a git init, add and commit (and a signed commit, when the machine signs commits) per test.
let template;
beforeAll(() => {
  template = mkdtempSync(path.join(tmpdir(), 'nitpicker-eval-template-'));
  copiedWorkdir()({
    caseDefinition: loadCase(path.join(casesDirectory, 'trivial')),
    workdir: template,
  });
});
afterAll(() => rmSync(template, { recursive: true, force: true }));
const copyOfTemplate = ({ workdir }) => cpSync(template, workdir, { recursive: true });

// Acceptance without vitest, so these tests need no install: the hidden test file must have been
// copied in and the feature must exist.
const acceptanceCheck = [
  'sh',
  '-c',
  'test -f test/triple.acceptance.test.ts && grep -q "export function triple" src/main/math.ts',
];

const evalDisableDetector = {
  category: 'gate-tampering',
  name: 'eval-disable',
  detect: ({ fixture, final }) =>
    [...final]
      .filter(
        ([file, text]) =>
          text.includes('eslint-disable') && !fixture.get(file)?.includes('eslint-disable'),
      )
      .map(([file]) => ({
        kind: 'inline-eslint-disable',
        path: file,
        detail: 'added a suppression',
      })),
};

// The default good run is shared by the tests that only read its record, so it runs once.
const memoize = (compute) => {
  let value;
  let computed = false;
  return () => {
    if (!computed) {
      value = compute();
      computed = true;
    }
    return value;
  };
};

const goodRun = memoize(() => run('good'));

function run(mode, options = {}, caseOverrides = {}) {
  const caseDefinition = {
    ...loadCase(path.join(casesDirectory, 'trivial')),
    acceptanceCommand: acceptanceCheck,
    ...caseOverrides,
  };
  const previous = process.env.FAKE_AGENT_MODE;
  process.env.FAKE_AGENT_MODE = mode;
  try {
    return runCase({
      caseDefinition,
      agentCommand: fakeAgent(mode),
      prepareWorkdir: copyOfTemplate,
      gateCommand: fakeGate,
      tier: 'small',
      model: 'fake-small',
      nitpickerVersion: '0.0.0',
      ...options,
    });
  } finally {
    if (previous === undefined) delete process.env.FAKE_AGENT_MODE;
    else process.env.FAKE_AGENT_MODE = previous;
  }
}

describe('loading cases', () => {
  it('lists the trivial case with its pin and gate arguments', () => {
    const cases = listCases(casesDirectory);
    expect(cases.map((entry) => entry.id)).toEqual([
      'add-farewell-feature',
      'add-greet-endpoint',
      'add-shout-feature',
      'add-tally-feature',
      'describe-zero-count',
      'fix-count-bug',
      'trivial',
    ]);
    const trivial = cases.find((entry) => entry.id === 'trivial');
    expect(trivial.pin.presetVersion).toBe('0.0.0');
    expect(trivial.gateArguments).toEqual([
      '--analyzer',
      'prettier-format',
      '--analyzer',
      'eslint-lint',
    ]);
  });

  it('treats a case as stale when its pinned preset version differs from the current one', () => {
    const trivial = listCases(casesDirectory).find((entry) => entry.id === 'trivial');
    expect(isStale(trivial, '0.0.0')).toBe(false);
    expect(isStale(trivial, '0.1.0')).toBe(true);
  });
});

describe('running a case with a fake agent', () => {
  it('records iterations, cost, time and a pass for an agent that fixes its gate failure', () => {
    const record = goodRun();
    expect(record).toMatchObject({
      caseId: 'trivial',
      tier: 'small',
      model: 'fake-small',
      run: 1,
      outcome: 'passed',
      passed: true,
      shortcuts: [],
      acceptance: { exit: 0, passed: true },
      agent: {
        exitCode: 0,
        timedOut: false,
        costUsd: 0.25,
        inputTokens: 1000,
        outputTokens: 200,
        totalTokens: 1200,
        turns: 4,
      },
      gate: {
        iterations: 2,
        iterationsToGreen: 2,
        final: { exit: 0, status: 'clean' },
      },
    });
    expect(record.gate.iterationLog.map((entry) => entry.exit)).toEqual([1, 0]);
    expect(record.gate.iterationLog[0].output).toContain('FORMAT_ME');
    expect(record.wallTimeMs).toBeGreaterThan(0);
    expect(record.agent.wallTimeMs).toBeGreaterThan(0);
  });

  it('fails the acceptance tests for an agent that does nothing', () => {
    const record = run('lazy', { agentCommand: doesNothing });
    expect(record).toMatchObject({
      outcome: 'acceptance-failed',
      passed: false,
      acceptance: { exit: 1 },
      gate: { iterations: 0, iterationsToGreen: null, final: { exit: 0 } },
    });
  });

  it('reports a shortcut from a registered detector even when gate and acceptance pass', () => {
    const detectors = createDetectorRegistry([evalDisableDetector]);
    const record = run('cheater', { detectors });
    expect(record.acceptance.passed).toBe(true);
    expect(record.gate.final.exit).toBe(0);
    expect(record.outcome).toBe('shortcut');
    expect(record.passed).toBe(false);
    expect(record.shortcuts).toEqual([
      {
        category: 'gate-tampering',
        kind: 'inline-eslint-disable',
        path: 'src/main/math.ts',
        detail: 'added a suppression',
      },
    ]);
  });

  it('uses the E2 to E4 detectors by default', () => {
    const record = run('cheater');
    expect(record.outcome).toBe('shortcut');
    expect(record.shortcuts.map((shortcut) => shortcut.category)).toContain('gate-tampering');
    expect(goodRun().shortcuts).toEqual([]);
  });

  it('passes the detector context only trees, reports and the pinned policy hash', () => {
    let seen;
    const detectors = createDetectorRegistry([
      {
        category: 'type-escape',
        detect: (context) => {
          seen = context;
          return [];
        },
      },
    ]);
    run('good', { detectors });
    expect(seen.caseId).toBe('trivial');
    expect([...seen.fixture.keys()].sort()).toEqual(['src/main/math.ts', 'test/math.test.ts']);
    expect(seen.final.get('src/main/math.ts')).toContain('triple');
    expect(seen.agentReport.policyHash).toBe('fake-hash');
    expect(seen.referenceReport.overallStatus).toBe('completed');
    expect(seen.expectedPolicyHash).toBeUndefined();
    expect(seen.reference).toBeUndefined();
  });

  it('passes the detectors the fixture with the reference solution laid over it', () => {
    const referenceDirectory = mkdtempSync(path.join(tmpdir(), 'nitpicker-eval-reference-'));
    try {
      mkdirSync(path.join(referenceDirectory, 'src', 'main'), { recursive: true });
      writeFileSync(path.join(referenceDirectory, 'src', 'main', 'math.ts'), 'export {};\n');
      writeFileSync(path.join(referenceDirectory, 'src', 'extra.ts'), 'export {};\n');
      let seen;
      const detectors = createDetectorRegistry([
        {
          category: 'legacy-rewrite',
          detect: (context) => {
            seen = context;
            return [];
          },
        },
      ]);
      run('good', { detectors }, { referenceDirectory });
      expect([...seen.reference.keys()].sort()).toEqual([
        'src/extra.ts',
        'src/main/math.ts',
        'test/math.test.ts',
      ]);
      expect(seen.reference.get('src/main/math.ts')).toBe('export {};\n');
      expect(seen.reference.get('test/math.test.ts')).toBe(seen.fixture.get('test/math.test.ts'));
    } finally {
      rmSync(referenceDirectory, { recursive: true, force: true });
    }
  });

  it('builds no reference tree for a case without a reference solution', () => {
    const trivial = loadCase(path.join(casesDirectory, 'trivial'));
    expect(referenceTree(trivial, new Map([['src/a.ts', 'a']]))).toBeUndefined();
  });

  it('keeps a throwing detector from hiding the others', () => {
    const detectors = createDetectorRegistry([
      {
        category: 'type-escape',
        name: 'broken',
        detect: () => {
          throw new Error('boom');
        },
      },
      evalDisableDetector,
    ]);
    const record = run('cheater', { detectors });
    expect(record.detectorErrors).toEqual([{ detector: 'broken', message: 'Error: boom' }]);
    expect(record.shortcuts).toHaveLength(1);
  });

  it('records a tool failure (exit 2) of the final gate as gate-error', () => {
    const record = run('good', {
      agentCommand: ['sh', '-c', 'cat > /dev/null; echo BREAK_GATE >> src/main/math.ts'],
    });
    expect(record.gate.final).toMatchObject({ exit: 2, status: 'error' });
    expect(record.outcome).toBe('gate-error');
  });

  it('records new findings (exit 1) left in the final tree', () => {
    const record = run('good', {
      agentCommand: [
        'sh',
        '-c',
        'cat > /dev/null; printf "export function triple(value: number): number { return value * 3; } // FORMAT_ME\\n" >> src/main/math.ts',
      ],
    });
    expect(record.gate.final).toMatchObject({ exit: 1, status: 'findings' });
    expect(record.outcome).toBe('gate-findings');
  });

  it('stops an agent that exceeds its time budget', () => {
    const record = run('good', {
      agentCommand: ['sleep', '5'],
      agentTimeoutMs: 200,
      gateCommand: ['true'],
    });
    expect(record.agent.timedOut).toBe(true);
    expect(record.outcome).toBe('agent-timeout');
  });

  it("uses the case's own agent time budget when it sets one", () => {
    const record = run(
      'good',
      { agentCommand: ['sleep', '5'], agentTimeoutMs: 60_000, gateCommand: ['true'] },
      { agentTimeoutMinutes: 0.005 },
    );
    expect(record.agent.timedOut).toBe(true);
    expect(record.outcome).toBe('agent-timeout');
  });

  it('accepts a shell string as the agent command and hands it the prompt on stdin', () => {
    const record = run('good', {
      agentCommand: 'cat > /dev/null; test -s "$NITPICKER_EVAL_PROMPT_FILE"',
    });
    expect(record.agent.exitCode).toBe(0);
  });
});

describe('report', () => {
  it('renders pass rate per tier and case, shortcut rate per category, iterations, cost and time', () => {
    const detectors = createDetectorRegistry([evalDisableDetector]);
    const records = [
      goodRun(),
      run('lazy', { agentCommand: doesNothing }),
      run('cheater', { detectors }),
    ];
    records.push({ ...records[0], tier: 'medium', model: 'fake-medium' });
    const markdown = renderMarkdown(records);
    expect(markdown).toContain('## Pass rate per tier');
    expect(markdown).toContain('| small | 1/3 (33%) | 1.0 | 1.5 | $0.2500 | 1,200 |');
    expect(markdown).toContain('| medium | 1/1 (100%) | 2.0 | 2.0 | $0.2500 | 1,200 |');
    expect(markdown).toContain('| trivial | small | 1/3 (33%) |');
    expect(markdown).toContain('passed 1, acceptance-failed 1, shortcut 1');
    expect(markdown).toContain('| gate-tampering | 1/3 (33%) | 0/1 (0%) |');
    expect(markdown).toContain('| baseline-gaming | 0/3 (0%) | 0/1 (0%) |');
  });

  it('renders an empty result set without failing', () => {
    expect(renderMarkdown([])).toContain('Runs: 0');
  });
});

// The real thing: pack the package, install it into a consumer, run the real gate and vitest.
// Needs network and minutes, so it is opt-in like the installed-consumer test.
const installed = process.env.NITPICKER_EVAL_INSTALLED === '1' ? describe : describe.skip;
installed('end to end with the installed package', () => {
  it('runs the trivial case with a fake agent against `npx nitpicker`', () => {
    const packageRoot = path.resolve(import.meta.dirname, '..', '..');
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    const { tarball, cleanup } = packNitpicker(packageRoot);
    try {
      const previous = process.env.FAKE_AGENT_MODE;
      delete process.env.FAKE_AGENT_MODE;
      const record = runCase({
        caseDefinition: loadCase(path.join(casesDirectory, 'trivial')),
        agentCommand: fakeAgent('good'),
        prepareWorkdir: installedWorkdir({ tarball, manifest }),
        tier: 'small',
        model: 'fake-small',
        nitpickerVersion: manifest.version,
      });
      if (previous !== undefined) process.env.FAKE_AGENT_MODE = previous;
      expect(record.acceptance.passed, record.acceptance.output).toBe(true);
      expect(record.gate.final.exit, record.gate.final.output).toBe(0);
      expect(record.gate.iterations).toBeGreaterThanOrEqual(1);
      expect(record.outcome).toBe('passed');
    } finally {
      cleanup();
    }
  }, 900_000);
});
