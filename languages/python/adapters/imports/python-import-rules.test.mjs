import { describe, expect, it } from 'vitest';
import { cycleFindings, outsideRootsFindings } from './python-import-rules.mjs';

const module = (file, name, isPackage = false) => ({ file, module: name, isPackage });
const from = (name, names) => ({ level: 0, module: name, names });

describe('import cycles', () => {
  it('reports a package cycle on each package anchor and ignores type-only imports', () => {
    const modules = [
      module('src/app/orders/__init__.py', 'app.orders', true),
      module('src/app/orders/service.py', 'app.orders.service'),
      module('src/app/billing/invoice.py', 'app.billing.invoice'),
      module('src/app/users/model.py', 'app.users.model'),
    ];
    const imports = {
      'src/app/orders/service.py': [
        from('app.billing.invoice', ['Invoice']),
        { ...from('app.users.model', ['User']), typeOnly: true },
      ],
      'src/app/billing/invoice.py': [from('app.orders.service', ['place'])],
      'src/app/users/model.py': [from('app.orders', ['service'])],
    };

    const findings = cycleFindings({ modules, imports });

    expect(findings.map(({ rule, path, identity }) => [rule, path, identity])).toEqual([
      ['package-cycle', 'src/app/billing/invoice.py', 'cycle:app.billing'],
      ['package-cycle', 'src/app/orders/__init__.py', 'cycle:app.orders'],
    ]);
    expect(findings[0].message).toBe(
      'Package app.billing is in a dependency cycle with app.orders. Move the shared types down into one of them, or invert one dependency behind an interface',
    );
  });
  it('does not count a package that imports its own submodules, and reports module cycles inside one package', () => {
    const modules = [
      module('src/app/__init__.py', 'app', true),
      module('src/app/a.py', 'app.a'),
      module('src/app/b.py', 'app.b'),
    ];
    const imports = {
      'src/app/__init__.py': [{ level: 1, module: null, names: ['a'] }],
      'src/app/a.py': [from('app.b', ['x']), from('app', ['VERSION'])],
      'src/app/b.py': [from('app.a', ['y'])],
    };

    expect(
      cycleFindings({ modules, imports }).map(({ rule, identity }) => [rule, identity]),
    ).toEqual([
      ['no-production-cycles', 'module-cycle:app.a'],
      ['no-production-cycles', 'module-cycle:app.b'],
    ]);
  });
});

describe('imports from outside the source roots', () => {
  it('reports production code that imports a module outside python.sourceRoots, once per target', () => {
    const report = {
      modules: [module('src/app/a.py', 'app.a')],
      others: [
        { file: 'scripts/helpers.py', module: 'scripts.helpers', kind: 'other', inRoots: false },
        { file: 'tests/test_a.py', module: 'tests.test_a', kind: 'test', inRoots: false },
        {
          file: 'src/app/tests/test_x.py',
          module: 'app.tests.test_x',
          kind: 'test',
          inRoots: true,
        },
      ],
      imports: {
        'src/app/a.py': [
          from('scripts.helpers', ['run']),
          { level: 0, module: null, names: ['scripts.helpers'] },
        ],
      },
    };

    const findings = outsideRootsFindings(report);

    expect(findings).toEqual([
      {
        tool: 'coupling',
        rule: 'no-import-outside-roots',
        path: 'src/app/a.py',
        identity: 'outside-roots:scripts.helpers',
        message:
          'app.a imports scripts.helpers from scripts/helpers.py, outside the source roots. Production code imports only from python.sourceRoots: move the imported code under a source root, or add its folder to "python.sourceRoots" so the gate checks it',
        classification: 'enforceable',
      },
    ]);
  });
});
