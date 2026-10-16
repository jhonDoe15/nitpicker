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
  it('reports a package more than 4 levels below its top-level package, once per folder', () => {
    const deep = 'src/app/a/b/c/d/e';
    const findings = pythonFolderDepthFindings(
      [
        module(`${deep}/__init__.py`, 'app.a.b.c.d.e', true),
        module(`${deep}/x.py`, 'app.a.b.c.d.e.x'),
        module('src/app/a/b/c/d/ok.py', 'app.a.b.c.d.ok'),
      ],
      { thresholds: {} },
    );

    const fix =
      'Keep packages at most 4 levels below the top-level package: group by responsibility instead of nesting. If this is intended, add {"rule":"folder-depth-limit","paths":["src/app/a/b/c/d/e/**"],"reason":"..."} to "exceptions" in nitpicker.config.json.';
    expect(findings).toEqual([
      {
        tool: 'structure',
        rule: 'folder-depth-limit',
        path: deep,
        identity: 'folder-depth:source:5',
        message: `Package is 5 levels below its top-level package (limit 4). ${fix}`,
        classification: 'enforceable',
        ratchet: {
          key: 'folder-depth:source',
          value: 5,
          worseMessage: `Package grew from {base} to 5 levels below its top-level package (limit 4). ${fix}`,
          heldMessage:
            'Package: 5 levels below its top-level package (limit 4), allowed because base was {base}; any increase fails.',
          pathIsFolder: true,
          folderFiles: 2,
        },
      },
    ]);
  });
  it('takes the limit from thresholds and lifts excepted folders', () => {
    const modules = [module('src/app/a/b.py', 'app.a.b')];

    expect(pythonFolderDepthFindings(modules, { thresholds: { folderDepth: 0 } })).toHaveLength(1);
    expect(
      pythonFolderDepthFindings(modules, {
        thresholds: { folderDepth: 0 },
        exceptions: [{ rule: 'folder-depth-limit', glob: 'src/app/a/**' }],
      }),
    ).toEqual([]);
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
