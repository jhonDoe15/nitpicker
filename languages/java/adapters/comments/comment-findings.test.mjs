import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COMMENTED_OUT_CODE_RULE,
  commentFindings,
  readCommentFindings,
  TASK_MARKER_RULE,
} from './comment-findings.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('commentFindings', () => {
  it('reports unreferenced markers and commented-out code with stable identities', () => {
    const source = [
      'class A {',
      '  // TODO tidy this',
      '  // int total = 5;',
      '  // TODO(#12): referenced',
      '}',
    ].join('\n');
    const findings = commentFindings(source, 'A.java');
    expect(findings.map(({ rule, location }) => [rule, location.line])).toEqual([
      [TASK_MARKER_RULE, 2],
      [COMMENTED_OUT_CODE_RULE, 3],
    ]);
    const moved = commentFindings(`\n\n${source}`, 'A.java');
    expect(moved.map(({ identity }) => identity)).toEqual(findings.map(({ identity }) => identity));
  });

  it('numbers repeated identical findings', () => {
    const findings = commentFindings('// TODO x\n// TODO x\n', 'A.java');
    expect(new Set(findings.map(({ identity }) => identity)).size).toBe(2);
  });
});

describe('readCommentFindings', () => {
  it('scans Java files under the source roots only', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'comments-'));
    roots.push(root);
    mkdirSync(path.join(root, 'src/main/java'), { recursive: true });
    writeFileSync(path.join(root, 'src/main/java/A.java'), '// FIXME later\nclass A {}\n');
    writeFileSync(path.join(root, 'src/main/java/notes.txt'), '// FIXME later\n');
    const findings = readCommentFindings(root, ['src/main/java', 'src/missing']);
    expect(findings.map(({ path: file, rule }) => [file, rule])).toEqual([
      ['src/main/java/A.java', TASK_MARKER_RULE],
    ]);
  });
});
