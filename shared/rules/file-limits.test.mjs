import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../core/diff/compare.mjs';
import { parseFinding } from '../../core/diff/finding-schema.mjs';
import { collectFileLimitFindings, evaluateFileLimits } from './file-limits.mjs';

const lines = (count, text = 'x') => `${Array.from({ length: count }, () => text).join('\n')}\n`;
const source = (filePath, text = 'x\n') => ({ path: filePath, kind: 'source', text });
const test = (filePath, text = 'x\n') => ({ path: filePath, kind: 'test', text });
const evaluate = (files, options = {}) =>
  evaluateFileLimits(files, { analyzerName: 'structure', ...options });
const summary = (findings) =>
  findings.map(({ rule, path: findingPath, identity, location }) => ({
    rule,
    path: findingPath,
    identity,
    ...(location === undefined ? {} : { line: location.line }),
  }));

describe('file length', () => {
  it('fails a source file over 300 lines and a test file over 500, not one at the limit', () => {
    const findings = evaluate([
      source('src/a.ts', lines(300)),
      source('src/b.ts', lines(301)),
      test('src/b.test.ts', lines(500)),
      test('test/c.test.ts', lines(501)),
    ]);
    expect(summary(findings)).toEqual([
      { rule: 'file-lines-limit', path: 'src/b.ts', identity: 'file-lines:301' },
      { rule: 'file-lines-limit', path: 'test/c.test.ts', identity: 'file-lines:501' },
    ]);
    expect(findings[0].message).toBe(
      'src/b.ts has 301 lines (limit 300). Split it into files by responsibility. If this is intended, add an exception for this rule in nitpicker.config.json.',
    );
    expect(findings[0].ratchet).toEqual({
      key: 'file-lines',
      value: 301,
      worseMessage:
        'src/b.ts grew from {base} to 301 lines (limit 300). Put new code in a new file.',
      heldMessage:
        'src/b.ts: 301 lines (limit 300), allowed because base was {base}; any increase fails.',
    });
  });

  it('counts a last line without a newline and takes the limits from thresholds', () => {
    const findings = evaluate([source('src/a.ts', 'a\nb\nc'), test('test/a.test.ts', 'a\nb\n')], {
      thresholds: { fileLines: 2, testFileLines: 1 },
    });
    expect(summary(findings)).toEqual([
      { rule: 'file-lines-limit', path: 'src/a.ts', identity: 'file-lines:3' },
      { rule: 'file-lines-limit', path: 'test/a.test.ts', identity: 'file-lines:2' },
    ]);
  });

  it('skips a file an exception lifts the rule for', () => {
    const findings = evaluate([source('src/gen/a.ts', lines(400))], {
      exceptions: [{ rule: 'file-lines-limit', paths: ['src/gen/**'] }],
    });
    expect(findings).toEqual([]);
  });
});

describe('line length', () => {
  const long = `const value = compute(${'a'.repeat(100)}, other);`;

  it('fails a line over 120 characters, identified by its text rather than its line number', () => {
    const [first] = evaluate([source('src/a.ts', `x\n${long}\n`)]);
    const [moved] = evaluate([source('src/a.ts', `x\ny\nz\n    ${long}\n`)]);
    expect(summary([first])).toEqual([
      { rule: 'line-length-limit', path: 'src/a.ts', identity: first.identity, line: 2 },
    ]);
    expect(moved.identity).toBe(first.identity);
    expect(first.message).toBe(
      `Line is ${String(long.length)} characters (limit 120). Break it up or extract a named value. If this is intended, add an exception for this rule in nitpicker.config.json.`,
    );
  });

  it('numbers repeated long lines and counts characters, not UTF-16 units', () => {
    const findings = evaluate([source('src/a.ts', `${long}\n${long}\n${'é'.repeat(120)}\n`)]);
    expect(findings.map(({ identity }) => identity.replace(/^line:\w+:/u, ''))).toEqual([
      'occurrence:1',
      'occurrence:2',
    ]);
    expect(evaluate([source('src/a.ts', `${'😀'.repeat(120)}\n`)])).toEqual([]);
  });

  it('ignores lines a formatter cannot break: imports, URLs and string literal text', () => {
    const text = [
      `import { ${'a'.repeat(120)} } from './x';`,
      `} from './${'b'.repeat(120)}';`,
      `// see https://example.com/${'c'.repeat(120)}`,
      `  '${'d'.repeat(120)}',`,
      `  message: "${'e'.repeat(120)}",`,
      `const label = \`${'f'.repeat(120)}\`;`,
      `throw new Error('${'g'.repeat(60)}', { cause: '${'h'.repeat(60)}' });`,
      '',
    ].join('\n');
    expect(evaluate([source('src/a.ts', text)])).toEqual([]);
  });

  it('still fails a line whose code, not its strings, is too long', () => {
    const text = `const x = 'a' + compute(${'b, '.repeat(40)}c) + 'd';\n`;
    expect(evaluate([source('src/a.ts', text)]).map(({ rule }) => rule)).toEqual([
      'line-length-limit',
    ]);
  });

  it('takes the limit from thresholds and skips excepted files', () => {
    expect(evaluate([source('src/a.ts', 'abcdef\n')], { thresholds: { lineLength: 5 } })).toEqual([
      expect.objectContaining({ rule: 'line-length-limit' }),
    ]);
    expect(
      evaluate([source('src/a.ts', 'abcdef\n')], {
        thresholds: { lineLength: 5 },
        exceptions: [{ rule: 'line-length-limit', paths: ['src/*.ts'] }],
      }),
    ).toEqual([]);
  });
});

describe('files per folder', () => {
  const files = (folder, count, make = source) =>
    Array.from({ length: count }, (_, index) => make(`${folder}/f${String(index)}.ts`));

  it('fails a folder with more than 6 source files directly in it, counting tests apart', () => {
    const findings = evaluate([
      ...files('src/feature', 7),
      ...files('src/feature', 6, test),
      ...files('src/feature/parts', 6),
      ...files('src/ok', 6),
    ]);
    expect(summary(findings)).toEqual([
      { rule: 'folder-files-limit', path: 'src/feature', identity: 'folder-files:source:7' },
    ]);
    expect(findings[0].message).toBe(
      'src/feature has 7 source files directly in it (limit 6). Group related files into subfolders. If this is intended, add an exception for this rule in nitpicker.config.json.',
    );
    expect(findings[0].ratchet.key).toBe('folder-files:source');
    expect(findings[0].ratchet.worseMessage).toBe(
      'src/feature grew from {base} to 7 source files (limit 6). Put the new file in a subfolder.',
    );
  });

  it('fails a test folder on its own count and uses the folderFiles threshold', () => {
    const findings = evaluate([...files('test', 3, test), ...files('src', 3)], {
      thresholds: { folderFiles: 2 },
    });
    expect(summary(findings)).toEqual([
      { rule: 'folder-files-limit', path: 'test', identity: 'folder-files:test:3' },
      { rule: 'folder-files-limit', path: 'src', identity: 'folder-files:source:3' },
    ]);
  });

  it('leaves excepted files out of the count', () => {
    const findings = evaluate([...files('src/icons', 30), ...files('src/app', 3)], {
      exceptions: [{ rule: 'folder-files-limit', paths: ['src/icons/**'] }],
      thresholds: { folderFiles: 2 },
    });
    expect(summary(findings)).toEqual([
      { rule: 'folder-files-limit', path: 'src/app', identity: 'folder-files:source:3' },
    ]);
  });
});

describe('checks and file reading', () => {
  it('runs only the checks a language leaves to nitpicker', () => {
    const findings = evaluate([source('src/a.ts', `${'a '.repeat(80)}\n`)], {
      checks: ['fileLines', 'folderFiles'],
    });
    expect(findings).toEqual([]);
  });

  it('reads each listed file under the project root', () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-file-limits-'));
    try {
      mkdirSync(path.join(projectRoot, 'src'));
      writeFileSync(path.join(projectRoot, 'src/a.ts'), lines(3));
      const findings = collectFileLimitFindings(
        projectRoot,
        [{ path: 'src/a.ts', kind: 'source' }],
        {
          analyzerName: 'structure',
          thresholds: { fileLines: 2 },
        },
      );
      expect(summary(findings)).toEqual([
        { rule: 'file-lines-limit', path: 'src/a.ts', identity: 'file-lines:3' },
      ]);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

describe('comparison against the base', () => {
  const compare = (base, head) =>
    compareFindings({
      baseFindings: evaluate(base).map((finding) => parseFinding(finding)),
      headFindings: evaluate(head).map((finding) => parseFinding(finding)),
    });
  const folder = (count) =>
    Array.from({ length: count }, (_, index) => source(`src/f${String(index)}.ts`));
  const newMessages = (result) => result.newFindings.map(({ message }) => message);

  it('holds a file already over the limit that does not grow', () => {
    const result = compare([source('src/a.ts', lines(400))], [source('src/a.ts', lines(390))]);
    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings.map(({ heldAtBase }) => heldAtBase)).toEqual([400]);
  });

  it('fails a file over the limit that grows, naming the base size', () => {
    const result = compare([source('src/a.ts', lines(400))], [source('src/a.ts', lines(401))]);
    expect(newMessages(result)).toEqual([
      'src/a.ts grew from 400 to 401 lines (limit 300). Put new code in a new file.',
    ]);
  });

  it('fails a file the change pushes over the limit', () => {
    const result = compare([source('src/a.ts', lines(300))], [source('src/a.ts', lines(301))]);
    expect(result.newFindings.map(({ rule }) => rule)).toEqual(['file-lines-limit']);
  });

  it('holds a folder over the limit until a file is added to it', () => {
    expect(compare(folder(12), folder(12)).newFindings).toEqual([]);
    expect(compare(folder(12), folder(11)).newFindings).toEqual([]);
    expect(newMessages(compare(folder(12), folder(13)))).toEqual([
      'src grew from 12 to 13 source files (limit 6). Put the new file in a subfolder.',
    ]);
  });

  it('fails a long line the change writes and keeps one it leaves alone', () => {
    const long = `run(${'a'.repeat(130)});`;
    const edited = `run(${'b'.repeat(130)});`;
    expect(
      compare([source('src/a.ts', `${long}\n`)], [source('src/a.ts', `x\n${long}\n`)]).newFindings,
    ).toEqual([]);
    expect(
      compare(
        [source('src/a.ts', `${long}\n`)],
        [source('src/a.ts', `${edited}\n`)],
      ).newFindings.map(({ rule }) => rule),
    ).toEqual(['line-length-limit']);
  });
});
