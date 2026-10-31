import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { docsUrl } from '../../shared/messages/docs-url.mjs';
import { writeSnapshotReports } from './reporters.mjs';

const roots = [];
const KNOWN = {
  tool: 'pmd',
  rule: 'UnusedLocalVariable',
  path: 'src/main/A.java',
  identity: 'a',
  message: 'Remove the unused variable.',
  classification: 'enforceable',
};
const UNKNOWN = { ...KNOWN, tool: 'custom', rule: 'text-file', identity: 'b' };
const REFERENCE_LINE = `Rule reference: ${docsUrl('docs/rules/README.md')} (nitpicker explain <tool/rule> prints one rule)`;

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function written(findings) {
  const outputRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-snapshot-reports-'));
  roots.push(outputRoot);
  const text = writeSnapshotReports(outputRoot, {
    summary: { overallStatus: 'violations', tools: [], elapsedMs: 0 },
    findings,
    toolErrors: [],
  });
  return {
    text,
    findings: JSON.parse(readFileSync(path.join(outputRoot, 'findings.json'), 'utf8')),
  };
}

describe('the --all reports', () => {
  it('link each finding whose rule has an entry and end the text report with the rule reference', () => {
    const { text, findings } = written([KNOWN, UNKNOWN]);

    expect(findings).toEqual([
      { ...KNOWN, helpUri: docsUrl('docs/rules/java-pmd.md', 'pmd-unusedlocalvariable') },
      UNKNOWN,
    ]);
    expect(text.split('\n').filter((line) => line.startsWith('Rule reference: '))).toEqual([
      REFERENCE_LINE,
    ]);
  });

  it('print no rule reference line when no finding has an entry', () => {
    const { text } = written([UNKNOWN]);

    expect(text.split('\n').filter((line) => line.startsWith('Rule reference: '))).toEqual([]);
  });
});
