import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestMypy, ingestPyright } from './type-check.mjs';

const fixture = (name) => readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8');
const roots = ['/work/project'];

describe('mypy text report', () => {
  it('turns each error into a finding keyed by its code and message, never its line', () => {
    expect(ingestMypy(fixture('mypy.txt'), { roots })).toEqual([
      {
        tool: 'mypy',
        rule: 'no-untyped-def',
        path: 'src/demo/untyped.py',
        identity: 'Function is missing a type annotation',
        message: 'Function is missing a type annotation',
        classification: 'enforceable',
        location: { line: 1 },
      },
      {
        tool: 'mypy',
        rule: 'return-value',
        path: 'src/demo/double.py',
        identity: 'Incompatible return value type (got "int", expected "str")',
        message: 'Incompatible return value type (got "int", expected "str")',
        classification: 'enforceable',
        location: { line: 2 },
      },
    ]);
  });

  it('reads columns, absolute paths and errors without a code', () => {
    const text = '/work/project/src/a.py:7:5: error: Something is off\n';

    expect(ingestMypy(text, { roots })).toEqual([
      {
        tool: 'mypy',
        rule: 'type-error',
        path: 'src/a.py',
        identity: 'Something is off',
        message: 'Something is off',
        classification: 'enforceable',
        location: { line: 7, column: 5 },
      },
    ]);
  });

  it('numbers repeats of one error in one file and counts each rule separately', () => {
    const text = [
      'a.py:1: error: Bad  [misc]',
      'a.py:9: error: Bad  [misc]',
      'a.py:3: error: Bad  [other]',
      'b.py:3: error: Bad  [misc]',
    ].join('\n');

    expect(
      ingestMypy(text, { roots }).map(
        ({ path: file, rule, identity }) => `${file} ${rule} ${identity}`,
      ),
    ).toEqual(['a.py misc Bad', 'a.py misc Bad#2', 'a.py other Bad', 'b.py misc Bad']);
  });

  it('keeps the identity when lines move', () => {
    const before = ingestMypy('a.py:1: error: Bad  [misc]\n', { roots });
    const after = ingestMypy('a.py:40: error: Bad  [misc]\n', { roots });

    expect(after[0].identity).toBe(before[0].identity);
  });

  it('keeps the identity of a redefinition when the code above it moves', () => {
    const before = 'a.py:9: error: Name "dup" already defined on line 5  [no-redef]\n';
    const after = 'a.py:14: error: Name "dup" already defined on line 10  [no-redef]\n';

    expect(ingestMypy(after, { roots })).toEqual([
      expect.objectContaining({
        identity: 'Name "dup" already defined',
        message: 'Name "dup" already defined on line 10',
        location: { line: 14 },
      }),
    ]);
    expect(ingestMypy(after, { roots })[0].identity).toBe(
      ingestMypy(before, { roots })[0].identity,
    );
  });

  it('ignores notes, summaries and files outside the project', () => {
    const text = [
      'a.py:1: note: See docs',
      'Found 1 error in 1 file (checked 2 source files)',
      '/elsewhere/lib.py:2: error: Not ours  [misc]',
      '',
    ].join('\n');

    expect(ingestMypy(text, { roots })).toEqual([]);
  });

  it('treats a warning as enforceable', () => {
    expect(ingestMypy('a.py:1: warning: Careful  [misc]\n', { roots })[0].classification).toBe(
      'enforceable',
    );
  });
});

describe('pyright JSON report', () => {
  it('turns each diagnostic into a finding keyed by its rule and first message line', () => {
    const findings = ingestPyright(fixture('pyright.json'), { roots });

    expect(findings[0]).toEqual({
      tool: 'pyright',
      rule: 'reportReturnType',
      path: 'src/demo/double.py',
      identity: 'Type "int" is not assignable to return type "str"',
      message: 'Type "int" is not assignable to return type "str"',
      classification: 'enforceable',
      location: { line: 2, column: 12 },
    });
    expect(findings.map(({ rule, path: file }) => `${rule} ${file}`)).toEqual([
      'reportReturnType src/demo/double.py',
      'reportUnknownParameterType src/demo/untyped.py',
      'reportUnknownParameterType src/demo/untyped.py',
      'reportMissingParameterType src/demo/untyped.py',
      'reportUnknownVariableType src/demo/untyped.py',
    ]);
  });

  it('numbers repeated messages of one rule in one file', () => {
    const findings = ingestPyright(fixture('pyright.json'), { roots });

    expect(
      findings
        .filter(({ rule }) => rule === 'reportUnknownParameterType')
        .map(({ identity }) => identity),
    ).toEqual(['Return type is unknown', 'Type of parameter "value" is unknown']);
  });

  it('keeps the identity of a message that names another line when the code above moves', () => {
    const report = (line) =>
      JSON.stringify({
        generalDiagnostics: [
          {
            file: '/work/project/a.py',
            severity: 'error',
            message: `"dup" is obscured by a declaration from line ${String(line)}`,
            rule: 'reportRedeclaration',
          },
        ],
      });

    expect(ingestPyright(report(10), { roots })[0].identity).toBe(
      ingestPyright(report(5), { roots })[0].identity,
    );
    expect(ingestPyright(report(10), { roots })[0].identity).toBe(
      '"dup" is obscured by a declaration',
    );
  });

  it('skips a package banner printed before the JSON', () => {
    const text = `WARNING: there is a new pyright version available\n${JSON.stringify({
      generalDiagnostics: [
        { file: '/work/project/a.py', severity: 'information', message: 'Hm', rule: 'reportX' },
        { file: '/work/project/b.py', severity: 'error', message: 'Syntax' },
      ],
    })}`;

    expect(ingestPyright(text, { roots })).toEqual([
      {
        tool: 'pyright',
        rule: 'reportX',
        path: 'a.py',
        identity: 'Hm',
        message: 'Hm',
        classification: 'descriptive',
        location: { line: 1 },
      },
      {
        tool: 'pyright',
        rule: 'type-error',
        path: 'b.py',
        identity: 'Syntax',
        message: 'Syntax',
        classification: 'enforceable',
        location: { line: 1 },
      },
    ]);
  });

  it('reads a report without diagnostics', () => {
    expect(ingestPyright('{"summary":{}}', { roots })).toEqual([]);
  });

  it('rejects output that is not a report', () => {
    expect(() => ingestPyright('pyright crashed', { roots })).toThrow('printed no JSON report');
  });

  it('drops diagnostics of files outside the project', () => {
    const text = JSON.stringify({
      generalDiagnostics: [{ file: '/elsewhere/a.py', severity: 'error', message: 'x', rule: 'r' }],
    });

    expect(ingestPyright(text, { roots })).toEqual([]);
  });
});
