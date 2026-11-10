import { describe, expect, it } from 'vitest';
import { goCouplingFindings } from './go-coupling.mjs';

function file(path, test = false) {
  return { path, package: 'x', test, generated: false, constrained: false };
}

function importing(path, ...imports) {
  return {
    file: path,
    imports: imports.map((importPath) => ({ path: importPath, name: '', line: 3 })),
    names: [],
    selectors: [],
    local: [],
  };
}

const REPORT = {
  files: [
    file('main.go'),
    file('core/doc.go'),
    file('core/rules.go'),
    file('core/rules_test.go', true),
    file('adapters/db.go'),
    file('adapters/http.go'),
  ],
  usages: [
    importing('main.go', 'shop/core', 'shop/adapters'),
    importing('core/doc.go'),
    importing('core/rules.go', 'shop/adapters', 'fmt'),
    importing('core/rules_test.go', 'shop', 'testing'),
    importing('adapters/db.go', 'database/sql'),
    importing('adapters/http.go', 'net/http'),
  ],
};

describe('Go package coupling', () => {
  it('reports a package that depends on a less stable one, on its doc.go', () => {
    const report = {
      files: [
        'main.go',
        'api/api.go',
        'core/rules.go',
        'core/doc.go',
        'helpers/h.go',
        'one/a.go',
        'two/b.go',
      ].map((path) => file(path)),
      usages: [
        importing('main.go', 'shop/core', 'shop/api'),
        importing('api/api.go', 'shop/core'),
        importing('core/rules.go', 'shop/helpers'),
        importing('core/doc.go'),
        importing('helpers/h.go', 'shop/one', 'shop/two'),
        importing('one/a.go'),
        importing('two/b.go'),
      ],
    };
    const findings = goCouplingFindings(report, 'shop').filter(
      ({ classification }) => classification === 'enforceable',
    );
    expect(
      findings.map(({ cause, ...finding }) => ({ ...finding, folders: cause.folders })),
    ).toEqual([
      {
        tool: 'coupling',
        rule: 'stability-direction',
        folders: ['core'],
        path: 'core/doc.go',
        identity: 'package-edge:core->helpers',
        message:
          'Package core depends on less stable package helpers. Depend on an interface the more stable package owns instead.',
        classification: 'enforceable',
      },
    ]);
  });

  it('counts only imports of production files into the module', () => {
    const findings = goCouplingFindings(REPORT, 'shop');
    expect(findings.filter(({ classification }) => classification === 'enforceable')).toEqual([]);
    expect(
      findings
        .filter(({ rule }) => rule === 'package-coupling')
        .filter(({ identity }) => identity.endsWith(':fanIn'))
        .map(({ identity, metric }) => `${identity} ${String(metric.value)}`),
    ).toEqual(['package:.:fanIn 0', 'package:adapters:fanIn 2', 'package:core:fanIn 1']);
  });

  it('anchors a package on its doc.go, else its first file that is not generated', () => {
    const report = {
      files: [...REPORT.files, { ...file('adapters/a_gen.go'), generated: true }],
      usages: [...REPORT.usages, importing('adapters/a_gen.go')],
    };
    expect(
      goCouplingFindings(report, 'shop')
        .filter(({ identity }) => identity === 'module:fanIn')
        .map(({ path: anchor }) => anchor),
    ).toEqual(['main.go', 'adapters/db.go', 'core/doc.go']);
  });
});
