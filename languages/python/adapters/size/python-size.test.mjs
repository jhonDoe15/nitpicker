import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  pythonClassLimitFindings,
  pythonFolderDepthFindings,
  readClassesReport,
} from './python-size.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const module = (file, name, isPackage = false) => ({ file, module: name, isPackage });

function classEntry(file, name, overrides = {}) {
  return { name, start: 1, kind: 'class', methods: 1, fields: 1, bases: [], file, ...overrides };
}

describe('Python package depth', () => {
  it('reports a package more than 4 levels below the root package, once per folder', () => {
    const deep = 'src/app/a/b/c/d/e';
    const findings = pythonFolderDepthFindings(
      [
        module('src/app/__init__.py', 'app', true),
        module(`${deep}/__init__.py`, 'app.a.b.c.d.e', true),
        module(`${deep}/x.py`, 'app.a.b.c.d.e.x'),
        module('src/app/a/b/c/d/ok.py', 'app.a.b.c.d.ok'),
      ],
      { thresholds: {} },
    );

    const form =
      'Keep packages at most 4 levels below the root package: group by responsibility instead of nesting.';
    const fix =
      'Keep packages at most 4 levels below the root package: group by responsibility instead of nesting. If this is intended, add {"rule":"folder-depth-limit","paths":["src/app/a/b/c/d/e/**"],"reason":"..."} to "exceptions" in nitpicker.config.json.';
    expect(findings).toEqual([
      {
        tool: 'structure',
        rule: 'folder-depth-limit',
        path: deep,
        identity: 'folder-depth:source:5',
        message: `Package is 5 levels below the root package (limit 4). ${fix}`,
        allowedForm: form,
        classification: 'enforceable',
        ratchet: {
          key: 'folder-depth:source',
          value: 5,
          worseMessage: `Package grew from {base} to 5 levels below the root package (limit 4). ${fix}`,
          worseAllowedForm: form,
          heldMessage:
            'Package: 5 levels below the root package (limit 4), allowed because base was {base}; any increase fails.',
          pathIsFolder: true,
          folderFiles: 2,
        },
      },
    ]);
  });
  it('takes the limit from thresholds and lifts excepted folders', () => {
    const modules = [module('src/app/a/b.py', 'app.a.b'), module('src/lib/c.py', 'lib.c')];

    expect(pythonFolderDepthFindings(modules, { thresholds: { folderDepth: 0 } })).toHaveLength(2);
    expect(
      pythonFolderDepthFindings(modules, {
        thresholds: { folderDepth: 0 },
        exceptions: [{ rule: 'folder-depth-limit', glob: 'src/**' }],
      }),
    ).toEqual([]);
  });
  it('measures below the common root, leaving out namespace folders without __init__.py', () => {
    const deep = 'acme.billing.api.v1.handlers.users';
    const modules = [
      module('src/acme/billing/__init__.py', 'acme.billing', true),
      module('src/acme/billing/domain/invoice.py', 'acme.billing.domain.invoice'),
      module(`src/${deep.replaceAll('.', '/')}/views.py`, `${deep}.views`),
      module('backend/app/__init__.py', 'backend.app', true),
    ];

    expect(pythonFolderDepthFindings(modules.slice(0, 3), { thresholds: {} })).toEqual([]);
    expect(
      pythonFolderDepthFindings(modules, { thresholds: {} }).map(({ path, message }) => [
        path,
        message.split('.')[0],
      ]),
    ).toEqual([
      [
        'src/acme/billing/api/v1/handlers/users',
        'Package is 5 levels below the root package (limit 4)',
      ],
    ]);
  });
  it('keeps the root when one deep package of a namespace tree gains an __init__.py', () => {
    const modules = [
      module('src/app/core/models.py', 'app.core.models'),
      module('src/app/main.py', 'app.main'),
      module(
        'src/app/api/v1/handlers/users/admin/views.py',
        'app.api.v1.handlers.users.admin.views',
      ),
    ];
    const marked = [
      ...modules,
      module(
        'src/app/api/v1/handlers/users/admin/__init__.py',
        'app.api.v1.handlers.users.admin',
        true,
      ),
    ];
    const depth = (options) =>
      pythonFolderDepthFindings(marked, { thresholds: {}, ...options }).map(
        ({ message }) => message.split(' (')[0],
      );

    expect(depth({ rootModules: modules })).toEqual(['Package is 5 levels below the root package']);
    expect(depth({})).toEqual(['Package is 5 levels below the root package']);
  });
  it('keeps the base root, so a new top-level package does not deepen the others', () => {
    const modules = [
      module('src/app/a/b/c/d/x.py', 'app.a.b.c.d.x'),
      module('src/lib/y.py', 'lib.y'),
    ];

    expect(pythonFolderDepthFindings(modules, { thresholds: {} })).toHaveLength(1);
    expect(
      pythonFolderDepthFindings(modules, { thresholds: {}, rootModules: modules.slice(0, 1) }),
    ).toEqual([]);
  });
  it('checks test packages against the production root, with their own folder key', () => {
    const findings = pythonFolderDepthFindings([module('src/app/core.py', 'app.core')], {
      thresholds: {},
      sourceRoots: ['src'],
      tests: [
        { file: 'tests/app/a/b/c/d/e/test_core.py', kind: 'test' },
        { file: 'src/app/a/b/tests/test_x.py', kind: 'test' },
        { file: 'tests/fixtures/a/b/c/d/e/f/data.py', kind: 'test' },
      ],
    });

    expect(findings.map(({ path, identity }) => [path, identity])).toEqual([
      ['tests/app/a/b/c/d/e', 'folder-depth:test:5'],
    ]);
  });
});

describe('Python class limits', () => {
  const modules = [
    module('src/app/base.py', 'app.base'),
    module('src/app/models.py', 'app.models'),
    module('src/app/__init__.py', 'app', true),
  ];

  it('reports methods and fields over the Java limits', () => {
    const report = {
      'src/app/models.py': {
        classes: [classEntry('src/app/models.py', 'Big', { methods: 21, fields: 11, start: 3 })],
        imports: [],
      },
    };

    const findings = pythonClassLimitFindings(report, modules, { thresholds: {} });

    expect(findings.map(({ rule, location }) => [rule, location.line])).toEqual([
      ['class-methods-limit', 3],
      ['class-fields-limit', 3],
    ]);
  });
  it('follows project bases through imports and leaves out object, ABC and Protocol', () => {
    const report = {
      'src/app/base.py': {
        classes: [
          classEntry('src/app/base.py', 'A', { bases: ['ABC'] }),
          classEntry('src/app/base.py', 'B', { bases: ['A'] }),
          classEntry('src/app/base.py', 'C', { bases: ['B', 'typing.Protocol'] }),
        ],
        imports: [],
      },
      'src/app/models.py': {
        classes: [
          classEntry('src/app/models.py', 'D', { bases: ['base.C'] }),
          classEntry('src/app/models.py', 'E', { bases: ['Other'] }),
        ],
        imports: [
          { level: 1, module: null, name: 'base', asname: null },
          { level: 0, module: 'app.base', name: 'C', asname: 'Other' },
        ],
      },
    };

    const findings = pythonClassLimitFindings(report, modules, {
      thresholds: { inheritanceDepth: 2 },
    });

    expect(
      findings.map(({ rule, message }) => [rule, message.split(' ').slice(0, 2).join(' ')]),
    ).toEqual([
      ['inheritance-depth-limit', 'Class D'],
      ['inheritance-depth-limit', 'Class E'],
    ]);
  });
  it('counts project base classes only, and no protocol or interface link', () => {
    const report = {
      'src/app/base.py': {
        classes: [
          classEntry('src/app/base.py', 'AppError', { bases: ['Exception'] }),
          classEntry('src/app/base.py', 'DomainError', { bases: ['AppError'] }),
          classEntry('src/app/base.py', 'NotFound', { bases: ['DomainError'] }),
          classEntry('src/app/base.py', 'UserNotFound', { bases: ['NotFound'] }),
          classEntry('src/app/base.py', 'Readable', { kind: 'protocol', bases: ['Protocol'] }),
          classEntry('src/app/base.py', 'Store', {
            kind: 'protocol',
            bases: ['Readable', 'Protocol'],
          }),
          classEntry('src/app/base.py', 'Cache', {
            kind: 'protocol',
            bases: ['Store', 'Protocol'],
          }),
          classEntry('src/app/base.py', 'Port', { kind: 'interface', bases: ['ABC'] }),
          classEntry('src/app/base.py', 'Memory', { bases: ['Cache', 'Port', 'UserNotFound'] }),
        ],
        imports: [],
      },
    };

    expect(
      pythonClassLimitFindings(report, modules, { thresholds: {} }).map(
        ({ message }) => message.split(' (')[0],
      ),
    ).toEqual(['Class Memory extends 4 classes deep']);
  });
  it('resolves a class named after the base it imports to that base, not to itself', () => {
    const versions = [
      module('src/app/v1/client.py', 'app.v1.client'),
      module('src/app/v2/client.py', 'app.v2.client'),
    ];
    const report = {
      'src/app/v1/client.py': {
        classes: [
          classEntry('src/app/v1/client.py', 'Transport'),
          classEntry('src/app/v1/client.py', 'Client', { bases: ['Transport'] }),
        ],
        imports: [],
      },
      'src/app/v2/client.py': {
        classes: [
          classEntry('src/app/v2/client.py', 'Client', { bases: ['Client'] }),
          classEntry('src/app/v2/client.py', 'RetryingClient', { bases: ['Client'] }),
          classEntry('src/app/v2/client.py', 'CachingClient', { bases: ['RetryingClient'] }),
          classEntry('src/app/v2/client.py', 'TracingClient', { bases: ['CachingClient'] }),
        ],
        imports: [{ level: 0, module: 'app.v1.client', name: 'Client', asname: null }],
      },
    };

    expect(
      pythonClassLimitFindings(report, versions, { thresholds: {} }).map(
        ({ message }) => message.split(' (')[0],
      ),
    ).toEqual([
      'Class TracingClient extends 5 classes deep',
      'Class CachingClient extends 4 classes deep',
    ]);
  });
  it('measures the classes below an unresolvable cycle from the parents outside it', () => {
    const report = {
      'src/app/base.py': {
        classes: [
          classEntry('src/app/base.py', 'Root'),
          classEntry('src/app/base.py', 'A', { bases: ['B', 'Root'] }),
          classEntry('src/app/base.py', 'B', { bases: ['A'] }),
          classEntry('src/app/base.py', 'C', { bases: ['A'] }),
          classEntry('src/app/base.py', 'D', { bases: ['C'] }),
          classEntry('src/app/base.py', 'E', { bases: ['D'] }),
        ],
        imports: [],
      },
    };

    expect(
      pythonClassLimitFindings(report, modules, { thresholds: {} }).map(
        ({ message }) => message.split(' (')[0],
      ),
    ).toEqual(['Class E extends 4 classes deep']);
  });
  it('walks a deep diamond hierarchy in linear time', () => {
    const ladder = Array.from({ length: 40 }, (_, step) => {
      const bases = [`C${String(step)}`, `D${String(step)}`];
      return [`C${String(step + 1)}`, `D${String(step + 1)}`].map((name) =>
        classEntry('src/app/base.py', name, { bases }),
      );
    });
    const classes = [
      classEntry('src/app/base.py', 'C0'),
      classEntry('src/app/base.py', 'D0'),
      ...ladder.flat(),
    ];
    const started = performance.now();

    const findings = pythonClassLimitFindings(
      { 'src/app/base.py': { classes, imports: [] } },
      modules,
      { thresholds: {} },
    );

    expect(performance.now() - started).toBeLessThan(1000);
    expect(
      findings
        .map(({ message }) => message.split(' (')[0])
        .filter((message) => message.startsWith('Class D40 ')),
    ).toEqual(['Class D40 extends 40 classes deep']);
  });
  it('checks only production modules', () => {
    const report = {
      'tests/test_x.py': {
        classes: [classEntry('tests/test_x.py', 'T', { methods: 40 })],
        imports: [],
      },
    };

    expect(pythonClassLimitFindings(report, modules, { thresholds: {} })).toEqual([]);
  });
  it('fails clearly when the structure step wrote no classes report', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-size-'));
    roots.push(root);

    expect(() => readClassesReport(root)).toThrow(/classes\.json report is missing/);
    writeFileSync(path.join(root, 'classes.json'), '{}');
    expect(readClassesReport(root)).toEqual({});
  });
});
