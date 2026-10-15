import { expect } from 'vitest';
import { exactText } from '../output-expectations.mjs';
export function expectedOutput174_32() {
  return [
    {
      tool: 'fake-quality-analyzer',
      rule: 'forbidden-dependency',
      path: 'src/main/source.ts',
      identity: 'src/main/source.ts->src/main/forbidden.ts',
      message: 'Fixture finding',
      classification: 'enforceable',
      location: { line: 1, column: 48 },
    },
  ];
}

export function expectedOutput211_35() {
  return [
    {
      tool: 'fake-quality-analyzer',
      rule: 'fixture-rule',
      path: 'src/main/metric.ts',
      symbol: undefined,
      identity: 'module-fan-out',
      message: 'Fixture finding',
      metric: 'fanOut',
      baseValue: 2,
      headValue: 5,
      delta: 3,
    },
  ];
}

export function expectedOutput351_80() {
  return [
    {
      tool: 'fake-quality-analyzer',
      snapshot: 'base',
      message: 'fake-quality-analyzer timed out after 100 ms',
    },
    {
      tool: 'fake-quality-analyzer',
      snapshot: 'head',
      message: 'fake-quality-analyzer timed out after 100 ms',
    },
  ];
}

export function expectedOutput410_31() {
  return [
    {
      tool: 'unknown-analyzer-0',
      snapshot: 'base',
      message: "Cannot read properties of null (reading 'resolveVersion')",
    },
    {
      tool: 'unknown-analyzer-0',
      snapshot: 'head',
      message: "Cannot read properties of null (reading 'resolveVersion')",
    },
  ];
}

export function expectedOutput705_31({ repository }) {
  return `Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: ${repository['outputRoot']}/report.txt\u001b[0m
`;
}

export function expectedOutput706_31({ repository }) {
  return `Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: ${repository['outputRoot']}/report.txt\u001b[0m
`;
}

export function expectedOutput707_31({ repository, path }) {
  return `Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2m${`Full diagnostics: ${path.join(repository.outputRoot, 'report.txt')}`}\u001b[0m
`;
}

export function expectedOutput711_82() {
  return expect.stringMatching(exactText`Nitpicker quality diff
Base ref: comparison-base
Merge base: ${/[a-f0-9]{40}/}
Head: ${/[a-f0-9]{40}/}
Status: completed
New enforceable findings: 0
New findings: 0
Resolved findings: 0
Unchanged findings: 1
Changed metrics: 0
Tool errors: 0

Per-tool counts:
fake-quality-analyzer: base=1 head=1 new=0 resolved=0 unchanged=1 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s
`);
}

export function expectedOutput738_31({ repository }) {
  return `Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m src/main/new.ts:1
    Fixture finding
\u001b[2mFull diagnostics: ${repository['outputRoot']}/report.txt\u001b[0m
`;
}

export function expectedOutput739_31({ repository }) {
  return `Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m src/main/new.ts:1
    Fixture finding
\u001b[2mFull diagnostics: ${repository['outputRoot']}/report.txt\u001b[0m
`;
}

export function expectedOutput740_31({ repository }) {
  return `Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m src/main/new.ts:1
    Fixture finding
\u001b[2mFull diagnostics: ${repository['outputRoot']}/report.txt\u001b[0m
`;
}

export function expectedOutput809_31({ repository }) {
  return `Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: ${repository['outputRoot']}/report.txt\u001b[0m
`;
}

export function expectedOutput838_31({ repository }) {
  return `Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: ${repository['outputRoot']}/report.txt\u001b[0m
`;
}

export function expectedOutput839_82() {
  return [
    {
      name: 'fake-quality-analyzer',
      version: '1.0.0',
      configurationHash: 'fixture-policy',
      base: 0,
      head: 0,
      new: 0,
      resolved: 0,
      unchanged: 0,
      changedMetrics: 0,
      baseElapsedMs: expect.any(Number),
      headElapsedMs: expect.any(Number),
      elapsedMs: expect.any(Number),
    },
  ];
}

export function expectedOutput862_31() {
  return 'nitpicker failed: Unknown --analyzer: does-not-exist. Known analyzers: fake-quality-analyzer\n';
}

export function expectedOutput896_31({ repository }) {
  return `Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/match-me\u001b[0m src/main/new.ts:1
    Fixture finding
\u001b[2mFull diagnostics: ${repository['outputRoot']}/report.txt\u001b[0m

Findings matching --rule match-me:

  New:
fake-quality-analyzer/match-me src/main/new.ts:1 Fixture finding

  Unchanged:
fake-quality-analyzer/match-me src/main/stable.ts:1 Fixture finding
`;
}

export function expectedOutput897_31({ repository }) {
  return `Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/match-me\u001b[0m src/main/new.ts:1
    Fixture finding
\u001b[2mFull diagnostics: ${repository['outputRoot']}/report.txt\u001b[0m

Findings matching --rule match-me:

  New:
fake-quality-analyzer/match-me src/main/new.ts:1 Fixture finding

  Unchanged:
fake-quality-analyzer/match-me src/main/stable.ts:1 Fixture finding
`;
}

export function expectedOutput914_31() {
  return 'nitpicker failed: No quality analyzers are configured. The comparison framework is ready, but real analyzer adapters are a later phase.\n';
}
