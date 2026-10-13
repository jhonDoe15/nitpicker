import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importLinterCompleted, ingestImportLinter } from './import-linter.mjs';

const fixture = (name) => readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8');
const FILES = new Map([
  ['app.domain.model', 'src/app/domain/model.py'],
  ['app.web.views', 'src/app/web/views.py'],
]);

describe('recognizing a finished import-linter run', () => {
  it('needs the contract summary line', () => {
    expect(importLinterCompleted(fixture('import-linter-kept.txt'))).toBe(true);
    expect(importLinterCompleted(fixture('import-linter-broken.txt'))).toBe(true);
    expect(importLinterCompleted(fixture('import-linter-no-config.txt'))).toBe(false);
  });
});

describe('import-linter findings', () => {
  it('reports nothing when every contract is kept', () => {
    expect(ingestImportLinter(fixture('import-linter-kept.txt')).findings).toEqual([]);
  });

  it('reports each import chain of a broken contract at its first module', () => {
    const { findings } = ingestImportLinter(fixture('import-linter-broken.txt'), { files: FILES });
    const byIdentity = (identity) => findings.find((finding) => finding.identity === identity);

    expect(findings.map(({ identity }) => identity).sort()).toEqual([
      'contract:Domain is pure:app.domain.model -> app.infra.db',
      'contract:Domain is pure:app.domain.model -> app.web.views -> app.infra.db',
      'contract:Independent:app.web.views -> app.domain.model -> app.infra.db',
      'contract:Independent:app.web.views -> app.infra.db',
      'contract:Layered:app.domain.model -> app.web.views',
    ]);
    expect(byIdentity('contract:Layered:app.domain.model -> app.web.views')).toEqual({
      tool: 'import-linter',
      rule: 'contract-broken',
      path: 'src/app/domain/model.py',
      identity: 'contract:Layered:app.domain.model -> app.web.views',
      message:
        'Import contract "Layered" is broken: app.domain.model -> app.web.views. Remove the import, or lift this file with exclude in nitpicker.config.json.',
      classification: 'enforceable',
      location: { line: 2 },
    });
    expect(byIdentity('contract:Independent:app.web.views -> app.infra.db')).toEqual({
      tool: 'import-linter',
      rule: 'contract-broken',
      path: 'src/app/web/views.py',
      identity: 'contract:Independent:app.web.views -> app.infra.db',
      message:
        'Import contract "Independent" is broken: app.web.views -> app.infra.db. Remove the import, or lift this file with exclude in nitpicker.config.json.',
      classification: 'enforceable',
      location: { line: 1 },
    });
  });

  it('falls back to the project when a module is not a known file', () => {
    const { findings } = ingestImportLinter(fixture('import-linter-broken.txt'));

    expect(new Set(findings.map(({ path: file }) => file))).toEqual(new Set(['.']));
  });

  it('keeps every line of a chain in the identity, not the line numbers', () => {
    const moved = fixture('import-linter-broken.txt').replaceAll('(l.1)', '(l.9)');

    expect(ingestImportLinter(moved).findings.map(({ identity }) => identity)).toEqual(
      ingestImportLinter(fixture('import-linter-broken.txt')).findings.map(
        ({ identity }) => identity,
      ),
    );
  });

  it('reads a hop that lists several import lines as one chain at its first line', () => {
    const files = new Map([['q.a.x', 'src/q/a/x.py']]);

    const { findings } = ingestImportLinter(fixture('import-linter-multi-line.txt'), { files });

    expect(findings).toEqual([
      {
        tool: 'import-linter',
        rule: 'contract-broken',
        path: 'src/q/a/x.py',
        identity: 'contract:a must not reach c:q.a.x -> q.b.y -> q.c.w',
        message:
          'Import contract "a must not reach c" is broken: q.a.x -> q.b.y -> q.c.w. Remove the import, or lift this file with exclude in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 2 },
      },
    ]);
  });

  it('keeps a legacy contract baselined when its import lines move', () => {
    const before = ingestImportLinter(fixture('import-linter-multi-line.txt')).findings;
    const moved = fixture('import-linter-multi-line.txt').replace(
      '(l.2, l.3, l.4)',
      '(l.7, l.8, l.9)',
    );
    const after = ingestImportLinter(moved).findings;

    expect(after.map(({ identity }) => identity)).toEqual(before.map(({ identity }) => identity));
    expect(after[0].location).toEqual({ line: 7 });
  });

  it('reports the items of contract types that do not list import chains', () => {
    const { findings } = ingestImportLinter(fixture('import-linter-other-types.txt'), {
      files: FILES,
    });

    expect(findings.map(({ identity, path: file }) => [identity, file])).toEqual([
      ['contract:Protected:app.web.views -> app.infra.db', 'src/app/web/views.py'],
      ['contract:Acyclic:.web -> .domain (1 import)', '.'],
    ]);
    expect(findings[1].message).toBe(
      'Import contract "Acyclic" is broken: .web -> .domain (1 import). Remove the import.',
    );
    expect(findings[1]).not.toHaveProperty('location');
  });

  it('reports a broken contract whose details cannot be read', () => {
    const text = [
      'Contracts',
      '',
      'Odd one BROKEN',
      '',
      'Contracts: 0 kept, 1 broken.',
      '',
      '----------------',
      'Broken contracts',
      '----------------',
      '',
      'Odd one',
      '-------',
      '',
      'Something happened.',
      '',
    ].join('\n');

    const { findings } = ingestImportLinter(text);

    expect(findings).toEqual([
      {
        tool: 'import-linter',
        rule: 'contract-broken',
        path: '.',
        identity: 'contract:Odd one',
        message: 'Import contract "Odd one" is broken. Remove the import.',
        classification: 'enforceable',
      },
    ]);
  });

  it('numbers the same chain printed under several sections of one contract', () => {
    const { findings } = ingestImportLinter(fixture('import-linter-overlapping.txt'));

    expect(findings.map(({ identity }) => identity)).toEqual([
      'contract:a must not reach c:q.a.x -> q.b.y -> q.c.w',
      'contract:a must not reach c:q.a.x -> q.b.y -> q.c.w#2',
      'contract:a must not reach c:q.a.x -> q.b.y -> q.c.w#3',
      'contract:a must not reach c:q.a.x -> q.b.y -> q.c.w#4',
    ]);
  });

  it('reads contract names that carry timings and a chain without line numbers', () => {
    const text = [
      'Fast one BROKEN [0.01s]',
      'Contracts: 0 kept, 1 broken.',
      'Broken contracts',
      'Fast one',
      '--------',
      '- a -> b',
      '  b -> c',
      '',
    ].join('\n');

    expect(ingestImportLinter(text).findings).toEqual([
      {
        tool: 'import-linter',
        rule: 'contract-broken',
        path: '.',
        identity: 'contract:Fast one:a -> b -> c',
        message: 'Import contract "Fast one" is broken: a -> b -> c. Remove the import.',
        classification: 'enforceable',
      },
    ]);
  });
});
