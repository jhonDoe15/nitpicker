import { describe, expect, it } from 'vitest';
import { JSON_NULL } from '../analysis/typed/json-null.mts';
import type { JsonNull } from '../analysis/typed/python-graph-types.mts';
import type { FactsBundle, ModuleFact, Scanned } from '../facts/typed/facts-types.mts';
import { withEntryPoints } from './python-entry-points.mts';

type Exported = Readonly<Record<string, readonly string[] | JsonNull>>;

function scannedWith(all: Exported): Scanned {
  return Object.fromEntries(
    Object.entries(all).map(([file, names]) => [
      file,
      {
        imports: [],
        definitions: [],
        qualifiedUses: undefined,
        exports: { all: names, reexports: [] },
        script: false,
        docComments: [],
      },
    ]),
  );
}

const IGNORED_FIELDS = new Set(['file', 'role', 'entry', 'qualifiedUses']);

function fieldsOf(module: ModuleFact) {
  return Object.fromEntries(Object.entries(module).filter(([key]) => !IGNORED_FIELDS.has(key)));
}

function entryModules(files: readonly string[], all: Exported) {
  const bundle: FactsBundle = {
    modules: files.map((file) => ({
      file,
      role: 'production',
      entry: false,
      qualifiedUses: undefined,
    })),
    packages: [],
    definitions: [],
    imports: [],
    docComments: [],
    nearDuplicateUnits: [],
  };
  return withEntryPoints(bundle, scannedWith(all)).modules.flatMap((module) => {
    const fields = fieldsOf(module);
    return Object.keys(fields).length > 0 ? [[module.file, fields]] : [];
  });
}

describe('Python entry points for public-alternative-bypass', () => {
  it('takes the subpackages of a single top-level package, with __all__, as components', () => {
    const files = [
      'src/shop/__init__.py',
      'src/shop/main.py',
      'src/shop/billing/__init__.py',
      'src/shop/orders/__init__.py',
      'src/shop/shared/__init__.py',
      'src/shop/billing/internal/__init__.py',
      'src/shop/billing/main.py',
    ];
    const all = {
      'src/shop/__init__.py': ['Invoice'],
      'src/shop/billing/__init__.py': ['Invoice'],
      'src/shop/orders/__init__.py': JSON_NULL,
      'src/shop/shared/__init__.py': ['Money'],
      'src/shop/billing/internal/__init__.py': ['Tax'],
    };

    expect(entryModules(files, all)).toEqual([
      ['src/shop/main.py', { compositionRoot: true }],
      ['src/shop/billing/__init__.py', { publicNames: ['Invoice'], entryName: 'shop.billing' }],
    ]);
  });

  it('takes the top-level packages as components when there are several', () => {
    const files = ['billing/__init__.py', 'orders/__init__.py', 'utils/__init__.py'];
    const all = {
      'billing/__init__.py': ['Invoice'],
      'orders/__init__.py': ['Cart'],
      'utils/__init__.py': ['slug'],
    };

    expect(entryModules(files, all)).toEqual([
      ['billing/__init__.py', { publicNames: ['Invoice'], entryName: 'billing' }],
      ['orders/__init__.py', { publicNames: ['Cart'], entryName: 'orders' }],
    ]);
  });
});
