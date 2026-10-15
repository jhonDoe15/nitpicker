import { expect } from 'vitest';
import { exactText } from '../output-expectations.mjs';
export function expectedOutput129_79() {
  return expect.stringMatching(exactText`Nitpicker quality diff
Base ref: origin/master
Merge base: merge-base
Head: head
Status: completed
New enforceable findings: 1
New findings: 1
Resolved findings: 0
Unchanged findings: 0
Changed metrics: 0
Tool errors: 0

Per-tool counts:
largest: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s
coverage: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s
crap: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s
medium: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s
small: base=0 head=0 new=1 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s

New findings:
small/example src/main/example.ts example finding
`);
}

export function expectedOutput157_79() {
  return expect.stringMatching(exactText`Nitpicker quality diff
Base ref: origin/master
Merge base: merge-base
Head: head
Status: completed
New enforceable findings: 0
New findings: 0
Resolved findings: 0
Unchanged findings: 0
Changed metrics: 0
Tool errors: 0

Per-tool counts:
structure: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s
other: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s

Touched, still over limit (not failing):
structure/function-lines-limit src/main/invoice.ts computeInvoice has 68 lines; limit is 50 (allowed because base was 68; any increase fails)
`);
}

export function expectedOutput302_31({ fixture }) {
  return `
\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33monly/example\u001b[0m src/main/example.ts
    example finding
\u001b[2mFull diagnostics: ${fixture['outputRoot']}/report.txt\u001b[0m
`;
}

export function expectedOutput303_31({ fixture }) {
  return `
\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33monly/example\u001b[0m src/main/example.ts
    example finding
\u001b[2mFull diagnostics: ${fixture['outputRoot']}/report.txt\u001b[0m
`;
}

export function expectedOutput304_31({ fixture }) {
  return `
\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33monly/example\u001b[0m src/main/example.ts
    example finding
\u001b[2mFull diagnostics: ${fixture['outputRoot']}/report.txt\u001b[0m
`;
}

export function expectedOutput305_31({ fixture }) {
  return `
\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33monly/example\u001b[0m src/main/example.ts
    example finding
\u001b[2mFull diagnostics: ${fixture['outputRoot']}/report.txt\u001b[0m
`;
}

export function expectedOutput371_31({ fixture }) {
  return `
Quality gate summary
✓ No new enforceable violations
Full diagnostics: ${fixture['outputRoot']}/report.txt
`;
}

export function expectedOutput372_31({ fixture }) {
  return `
Quality gate summary
✓ No new enforceable violations
Full diagnostics: ${fixture['outputRoot']}/report.txt
`;
}

export function expectedOutput373_31({ path, fixture }) {
  return `
Quality gate summary
✓ No new enforceable violations
${`Full diagnostics: ${path.join(path.dirname(fixture.inputRoot), 'combined/report.txt')}`}
`;
}
