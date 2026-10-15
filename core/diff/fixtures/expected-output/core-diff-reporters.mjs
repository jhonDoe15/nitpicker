import { expect } from 'vitest';
import { exactText } from '../output-expectations.mjs';
export function expectedOutput213_17() {
  return expect.stringMatching(exactText`<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="quality.diff" tests="3" failures="2" errors="0" time="${/[0-9]+(?:\.[0-9]+)?/}">
  <testcase classname="quality.diff" name="eslint" time="${/[0-9]+(?:\.[0-9]+)?/}"></testcase>
  <testcase classname="quality.diff.new-findings" name="eslint/no-console src/a.js:12" time="${/[0-9]+(?:\.[0-9]+)?/}"><failure message="Use &lt;logger&gt; &amp; &quot;quotes&quot; second line" type="eslint/no-console">Use &lt;logger&gt; &amp; &quot;quotes&quot;
second line</failure></testcase>
  <testcase classname="quality.diff" name="depcruise:head" time="${/[0-9]+(?:\.[0-9]+)?/}"><failure message="it&apos;s � broken">it&apos;s � broken</failure></testcase>
</testsuite>
`);
}

export function expectedOutput214_17() {
  return expect.stringMatching(exactText`<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="quality.diff" tests="3" failures="2" errors="0" time="${/[0-9]+(?:\.[0-9]+)?/}">
  <testcase classname="quality.diff" name="eslint" time="${/[0-9]+(?:\.[0-9]+)?/}"></testcase>
  <testcase classname="quality.diff.new-findings" name="eslint/no-console src/a.js:12" time="${/[0-9]+(?:\.[0-9]+)?/}"><failure message="Use &lt;logger&gt; &amp; &quot;quotes&quot; second line" type="eslint/no-console">Use &lt;logger&gt; &amp; &quot;quotes&quot;
second line</failure></testcase>
  <testcase classname="quality.diff" name="depcruise:head" time="${/[0-9]+(?:\.[0-9]+)?/}"><failure message="it&apos;s � broken">it&apos;s � broken</failure></testcase>
</testsuite>
`);
}

export function expectedOutput246_71() {
  return expect.stringMatching(exactText`Nitpicker quality diff
Base ref: main
Merge base: abc
Head: def
Status: completed
New enforceable findings: 1
New findings: 1
Resolved findings: 0
Unchanged findings: 0
Changed metrics: 0
Tool errors: 0

Per-tool counts:
eslint: base=0 head=1 new=1 resolved=0 unchanged=0 changed-metrics=undefined elapsed=${/[0-9]+(?:\.[0-9]+)?/}s

New findings:
eslint/no-console src/a.js:12 Unexpected console statement
`);
}

export function expectedOutput279_21() {
  return "\nQuality gate summary\nNo new enforceable violations, but the run is incomplete:\n✖ 2 tool errors\n  mutation (head): error TS2688: Cannot find type definition file for 'node'. at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1)… (full text in the diagnostics file)\n  mutation (base): error TS2688: Cannot find type definition file for 'node'. at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1)… (full text in the diagnostics file)\nFull diagnostics: reports/quality/diff/combined/report.txt\n";
}

export function expectedOutput282_21() {
  return "\nQuality gate summary\nNo new enforceable violations, but the run is incomplete:\n✖ 2 tool errors\n  mutation (head): error TS2688: Cannot find type definition file for 'node'. at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1)… (full text in the diagnostics file)\n  mutation (base): error TS2688: Cannot find type definition file for 'node'. at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1)… (full text in the diagnostics file)\nFull diagnostics: reports/quality/diff/combined/report.txt\n";
}

export function expectedOutput283_21() {
  return "\nQuality gate summary\nNo new enforceable violations, but the run is incomplete:\n✖ 2 tool errors\n  mutation (head): error TS2688: Cannot find type definition file for 'node'. at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1)… (full text in the diagnostics file)\n  mutation (base): error TS2688: Cannot find type definition file for 'node'. at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1)… (full text in the diagnostics file)\nFull diagnostics: reports/quality/diff/combined/report.txt\n";
}

export function expectedOutput285_21() {
  return "\nQuality gate summary\nNo new enforceable violations, but the run is incomplete:\n✖ 2 tool errors\n  mutation (head): error TS2688: Cannot find type definition file for 'node'. at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1)… (full text in the diagnostics file)\n  mutation (base): error TS2688: Cannot find type definition file for 'node'. at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1)… (full text in the diagnostics file)\nFull diagnostics: reports/quality/diff/combined/report.txt\n";
}

export function expectedOutput291_21() {
  return '\nQuality gate summary\n✓ No new enforceable violations\nFull diagnostics: reports/quality/diff/combined/report.txt\n';
}
