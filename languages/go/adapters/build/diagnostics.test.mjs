import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { diagnosticFindings } from './diagnostics.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-go-diagnostics-'));
writeFileSync(
  path.join(root, 'notes.go'),
  'package shop\n\n// TODO first note\n// TODO second note\n',
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const diagnostic = (line) => ({
  tool: 'go-rules',
  rule: 'todo-without-issue',
  file: 'notes.go',
  line,
  message: 'TODO without an issue reference',
});

describe('diagnosticFindings', () => {
  it('keys a finding on a comment-only line by its comment, so each keeps its own identity', () => {
    const findings = diagnosticFindings(root, [3, 4].map(diagnostic));

    expect(findings.map(({ identity }) => identity.split(':occurrence:')[1])).toEqual(['1', '1']);
    expect(new Set(findings.map(({ identity }) => identity)).size).toBe(2);
  });
});
