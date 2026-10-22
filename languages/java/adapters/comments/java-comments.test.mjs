import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { commentFindings, readCommentFindings } from './java-comments.mjs';

const TODO_MESSAGE =
  'A TODO or FIXME needs an issue reference: write "TODO(#123): ..." or "TODO PROJ-123: ...", or do the work now.';
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const summary = (source) =>
  commentFindings(source, 'A.java').map(({ rule, location }) => `${rule}:${location.line}`);

describe('TODO comments', () => {
  it.each([
    ['// TODO fix this later', ['TodoWithoutIssue:1']],
    ['// FIXME handle null', ['TodoWithoutIssue:1']],
    ['/* HACK: parser */', ['TodoWithoutIssue:1']],
    ['/**\n * Parses.\n * TODO: more\n */', ['TodoWithoutIssue:3']],
    ['// TODO(#12): fix this later', []],
    ['// TODO PROJ-123 fix', []],
    ['// FIXME https://tracker.example.com/issues/9', []],
    ['// TODOS are listed elsewhere', []],
    ['// todo: lower case', []],
    ['/** Todo item stored per user. */', []],
    ['// Phone numbers are formatted as XXX-XXX-XXXX.', []],
    ['// Drop the column after the migration, TODO: issue', ['TodoWithoutIssue:1']],
    ['// TODO SHA-256 hashing', ['TodoWithoutIssue:1']],
    ['// TODO(#12): split it, FIXME: rename it', ['TodoWithoutIssue:1']],
    ['// TODO(#12): split it, FIXME(#13): rename it', []],
    ['// Reads the TODO list of the user', []],
  ])('%s', (source, expected) => {
    expect(summary(`${source}\nclass A {}`)).toEqual(expected);
  });

  it('ignores a TODO inside a string or a text block', () => {
    const source = 'class A { String a = "// TODO later"; String b = """\n// FIXME x\n"""; }';
    expect(summary(source)).toEqual([]);
  });

  it('numbers repeated identical comments', () => {
    const findings = commentFindings('// TODO x\nclass A {}\n// TODO x\n', 'A.java');
    expect(findings.map(({ identity }) => identity.endsWith('#2'))).toEqual([false, true]);
  });
});

describe('commented-out code', () => {
  it('reports a run of commented lines once, at the line the comment starts', () => {
    const source = 'class A {\n  // Old way:\n  // int total = compute(items);\n  // total++;\n}\n';
    expect(summary(source)).toEqual(['CommentedOutCode:2']);
  });

  it('reports a block comment', () => {
    expect(summary('/*\nif (ready) {\n  go();\n}\n*/\nclass A {}')).toEqual(['CommentedOutCode:1']);
  });

  it('reports each separate comment', () => {
    expect(summary('// a();\nclass A {\n  // b();\n}\n')).toEqual([
      'CommentedOutCode:1',
      'CommentedOutCode:3',
    ]);
  });

  it.each([
    '// Returns the total price.',
    '// See https://example.com for details; it explains the rule.',
    '/** Calls {@code run();} once. */',
    '/**\n * <pre>\n * int a = 1;\n * </pre>\n */',
    '// NOPMD - generated',
    '// CHECKSTYLE:OFF',
    '/**\n * Loads the order.\n * int total = compute(items);\n * }\n */',
    '// Call this once per request; it caches the result;',
    '// }',
  ])('keeps the prose comment %s', (comment) => {
    expect(summary(`${comment}\nclass A {}`)).toEqual([]);
  });
});

describe('finding fields', () => {
  it('names the tool, rule, message and exception route', () => {
    const [finding] = commentFindings('// TODO x', 'src/main/java/A.java');
    expect(finding).toEqual({
      tool: 'comments',
      rule: 'TodoWithoutIssue',
      path: 'src/main/java/A.java',
      identity: `TodoWithoutIssue:${hash('TodoWithoutIssue\0TODO x')}`,
      message: TODO_MESSAGE,
      classification: 'enforceable',
      location: { line: 1 },
    });
  });

  it('keeps the identity when the comment moves', () => {
    const [before] = commentFindings('// a();\nclass A {}', 'A.java');
    const [after] = commentFindings('\n\n// a();\nclass A {}', 'A.java');
    expect(after.identity).toBe(before.identity);
  });
});

describe('readCommentFindings', () => {
  it('reads every Java file under the source roots and skips missing roots', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-comments-'));
    roots.push(root);
    mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
    writeFileSync(path.join(root, 'src/main/java/demo/A.java'), '// TODO x\nclass A {}\n');
    writeFileSync(path.join(root, 'src/main/java/demo/B.java'), 'class B {}\n');
    const findings = readCommentFindings(root, ['src/main/java', 'src/test/java']);
    expect(findings.map(({ path: file }) => file)).toEqual(['src/main/java/demo/A.java']);
  });
});

describe('a large file', () => {
  it('is scanned in linear time', () => {
    const source = Array.from(
      { length: 20_000 },
      (_, index) => `// note ${String(index)}\nint a${String(index)};`,
    ).join('\n');
    const started = performance.now();
    expect(commentFindings(source, 'A.java')).toEqual([]);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
