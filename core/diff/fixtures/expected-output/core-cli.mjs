import { expect } from 'vitest';
import { exactText } from '../output-expectations.mjs';
export function expectedOutput61_31({ repository }) {
  return expect.stringMatching(exactText`${`Base: ${repository.baseRef} (argument)`}

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m src/main/untracked.ts:1
    Fixture finding
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`);
}

export function expectedOutput62_31({ repository }) {
  return expect.stringMatching(exactText`Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m src/main/untracked.ts:1
    Fixture finding
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`);
}

export function expectedOutput83_31({ repository }) {
  return expect.stringMatching(exactText`Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`);
}

export function expectedOutput107_31() {
  return expect.stringMatching(exactText`Base: origin/main (remote-head)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`);
}

export function expectedOutput131_31({ repository }) {
  return expect.stringMatching(exactText`Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`);
}

export function expectedOutput154_31() {
  return 'Nitpicker quality snapshot\nStatus: violations\nEnforceable findings: 2\nDescriptive findings: 0\nTool errors: 0\n\nPer-tool counts:\nfake-quality-analyzer: total=2 enforceable=2 descriptive=0\n\nEnforceable findings:\nfake-quality-analyzer/fixture-rule src/main/first.ts:1 Fixture finding\nfake-quality-analyzer/other-rule src/main/second.ts:1 Fixture finding\n';
}

export function expectedOutput155_31() {
  return 'Nitpicker quality snapshot\nStatus: violations\nEnforceable findings: 2\nDescriptive findings: 0\nTool errors: 0\n\nPer-tool counts:\nfake-quality-analyzer: total=2 enforceable=2 descriptive=0\n\nEnforceable findings:\nfake-quality-analyzer/fixture-rule src/main/first.ts:1 Fixture finding\nfake-quality-analyzer/other-rule src/main/second.ts:1 Fixture finding\n';
}

export function expectedOutput156_31() {
  return 'Nitpicker quality snapshot\nStatus: violations\nEnforceable findings: 2\nDescriptive findings: 0\nTool errors: 0\n\nPer-tool counts:\nfake-quality-analyzer: total=2 enforceable=2 descriptive=0\n\nEnforceable findings:\nfake-quality-analyzer/fixture-rule src/main/first.ts:1 Fixture finding\nfake-quality-analyzer/other-rule src/main/second.ts:1 Fixture finding\n';
}

export function expectedOutput175_31() {
  return 'Nitpicker quality snapshot\nStatus: tool-error\nEnforceable findings: 0\nDescriptive findings: 0\nTool errors: 1\n\nPer-tool counts:\nfake-quality-analyzer: total=0 enforceable=0 descriptive=0\n\nTool errors:\nfake-quality-analyzer (head): fake-quality-analyzer crashed with exit 2: fake analyzer crash\n';
}

export function expectedOutput213_33({ mode }) {
  if (mode === '--all')
    return 'Nitpicker quality snapshot\nStatus: tool-error\nEnforceable findings: 1\nDescriptive findings: 0\nTool errors: 1\n\nPer-tool counts:\nfake-quality-analyzer: total=1 enforceable=1 descriptive=0\ncrashing-analyzer: total=0 enforceable=0 descriptive=0\n\nEnforceable findings:\nfake-quality-analyzer/fixture-rule src/main/new.ts:1 Fixture finding\n\nTool errors:\ncrashing-analyzer (head): crashing-analyzer crashed with exit 2: no diagnostic output\n';
  return expect.stringMatching(exactText`Base: comparison-base (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m src/main/new.ts:1
    Fixture finding
\u001b[1m\u001b[31m✖ 2 tool errors\u001b[0m
  \u001b[33mcrashing-analyzer (base)\u001b[0m: crashing-analyzer crashed with exit 2: no diagnostic output
  \u001b[33mcrashing-analyzer (head)\u001b[0m: crashing-analyzer crashed with exit 2: no diagnostic output
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`);
}

export function expectedOutput253_31() {
  return 'Nitpicker quality snapshot\nStatus: violations\nEnforceable findings: 1\nDescriptive findings: 0\nTool errors: 0\n\nPer-tool counts:\nfake-quality-analyzer: total=1 enforceable=1 descriptive=0\n\nEnforceable findings:\nfake-quality-analyzer/match-me src/main/existing.ts:1 Fixture finding\n\nFindings matching --rule match-me:\n\n  Matching:\nfake-quality-analyzer/match-me src/main/existing.ts:1 Fixture finding\n';
}

export function expectedOutput264_32() {
  return 'nitpicker failed: Unknown --analyzer: unknown. Known analyzers: fake-quality-analyzer\n';
}

export function expectedOutput280_31() {
  return 'Nitpicker quality snapshot\nStatus: violations\nEnforceable findings: 3\nDescriptive findings: 0\nTool errors: 0\n\nPer-tool counts:\nprettier-format: total=3 enforceable=3 descriptive=0\n\nEnforceable findings:\nprettier-format/prettier/prettier package-lock.json:1 Format these lines with Prettier\nprettier-format/prettier/prettier package.json:1 Format these lines with Prettier\nprettier-format/prettier/prettier src/main/example.ts:1 Format these lines with Prettier\n';
}

export function expectedOutput308_31() {
  return 'Nitpicker quality snapshot\nStatus: violations\nEnforceable findings: 1\nDescriptive findings: 0\nTool errors: 0\n\nPer-tool counts:\nfake-quality-analyzer: total=1 enforceable=1 descriptive=0\n\nEnforceable findings:\nfake-quality-analyzer/fixture-rule src/main/untracked.ts:1 Fixture finding\n';
}

export function expectedOutput404_31({ repository, outputRoot }) {
  return `Fixed files:
src/main/changed.ts
src/main/format.mjs
${`Base: ${repository.baseRef} (argument)`}

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
No new enforceable violations, but the run is incomplete:
\u001b[1m\u001b[31m✖ 1 tool error\u001b[0m
  \u001b[33meslint-fix (fix)\u001b[0m: eslint-fix failed: fixture ESLint failure
\u001b[2mFull diagnostics: ${outputRoot}/report.txt\u001b[0m
`;
}

export function expectedOutput405_31({ repository, outputRoot }) {
  return `Fixed files:
src/main/changed.ts
src/main/format.mjs
Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
No new enforceable violations, but the run is incomplete:
\u001b[1m\u001b[31m✖ 1 tool error\u001b[0m
  \u001b[33meslint-fix (fix)\u001b[0m: eslint-fix failed: fixture ESLint failure
\u001b[2mFull diagnostics: ${outputRoot}/report.txt\u001b[0m
`;
}

export function expectedOutput406_31({ repository, outputRoot }) {
  return `Fixed files:
src/main/changed.ts
src/main/format.mjs
Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
No new enforceable violations, but the run is incomplete:
\u001b[1m\u001b[31m✖ 1 tool error\u001b[0m
  \u001b[33meslint-fix (fix)\u001b[0m: eslint-fix failed: fixture ESLint failure
\u001b[2mFull diagnostics: ${outputRoot}/report.txt\u001b[0m
`;
}

export function expectedOutput408_85({ repository }) {
  return {
    requestedBaseRef: `${repository['baseRef']}`,
    resolvedBaseSha: `${repository['baseSha']}`,
    mergeBaseSha: `${repository['baseSha']}`,
    headSha: expect.stringMatching(exactText`${/[a-f0-9]{40}/}`),
    policyHash: expect.stringMatching(exactText`${/[a-f0-9]{64}/}`),
    configOverrides: [],
    tools: [
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
    ],
    exclusions: [],
    renamedPaths: 0,
    elapsedMs: expect.any(Number),
    overallStatus: 'tool-error',
    newEnforceableFindings: 0,
  };
}

export function expectedOutput411_89() {
  return [
    { tool: 'eslint-fix', snapshot: 'fix', message: 'eslint-fix failed: fixture ESLint failure' },
  ];
}

export function expectedOutput448_31({ repository }) {
  return expect.stringMatching(exactText`Fixed files:
(none)
Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`);
}

export function expectedOutput548_31() {
  return 'nitpicker failed: --fix cannot be combined with --all\n';
}

export function expectedOutput644_31({ root }) {
  return `
Quality gate summary
✖ 1 new enforceable violation
  second/example src/main/example.ts
    example finding
Full diagnostics: ${root}/combined/report.txt
`;
}

export function expectedOutput721_31() {
  return expect.stringMatching(exactText`Base: HEAD (config)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`);
}

export function expectedOutput727_31() {
  return expect.stringMatching(exactText`Base: HEAD (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`);
}

export function expectedOutput742_80() {
  return expect.stringMatching(exactText`Nitpicker quality diff
Base ref: HEAD
Merge base: ${/[a-f0-9]{40}/}
Head: ${/[a-f0-9]{40}/}
Status: completed
New enforceable findings: 0
New findings: 0
Resolved findings: 0
Unchanged findings: 0
Changed metrics: 0
Tool errors: 0

Config overrides:
  disable: ["second-analyzer"]

Per-tool counts:
fake-quality-analyzer: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s
`);
}

export function expectedOutput751_31() {
  return 'nitpicker failed: nitpicker.config.json: "disable" names unknown analyzers: nope. Known analyzers: fake-quality-analyzer\n';
}

export function expectedOutput810_20() {
  return {
    name: 'custom',
    version: 'custom',
    configurationHash: expect.stringMatching(exactText`${/[a-f0-9]{64}/}`),
    base: 1,
    head: 2,
    new: 1,
    resolved: 0,
    unchanged: 1,
    changedMetrics: 0,
    baseElapsedMs: expect.any(Number),
    headElapsedMs: expect.any(Number),
    elapsedMs: expect.any(Number),
  };
}

export function expectedOutput811_33({ repository, outputRoot }) {
  return `Base: ${repository['baseRef']} (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mcustom/text-file\u001b[0m src/main/new.txt
    Text file new.txt
\u001b[2mFull diagnostics: ${outputRoot}/report.txt\u001b[0m
`;
}

export function expectedOutput834_33() {
  return 'nitpicker failed: nitpicker.config.json: analyzers entry "fake-quality-analyzer" clashes with another analyzer name\n';
}

export function expectedOutput944_38() {
  return expect.stringMatching(exactText`Base: comparison-base (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m src/main/new.ts:1
    Fixture finding
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`);
}

export function expectedOutput1011_43() {
  return expect.stringMatching(exactText`Published 1 of 1 base snapshots for ${/[a-f0-9]{40}/}: fake-quality-analyzer
`);
}

export function expectedOutput1017_40() {
  return expect.stringMatching(exactText`Base: comparison-base (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m src/main/new.ts:1
    Fixture finding
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`);
}

export function expectedOutput1031_40() {
  return expect.stringMatching(exactText`Base: comparison-base (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m src/main/new.ts:1
    Fixture finding
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`);
}

export function expectedOutput1045_40() {
  return expect.stringMatching(exactText`Published 0 of 1 base snapshots for ${/[a-f0-9]{40}/}
Not published: fake-quality-analyzer (upload failed)
`);
}
