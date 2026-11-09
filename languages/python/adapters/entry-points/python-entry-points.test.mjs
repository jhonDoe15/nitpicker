import { describe, expect, it } from 'vitest';
import { withEntryPoints } from './python-entry-points.mjs';

function scannedWith(all) {
  return Object.fromEntries(
    Object.entries(all).map(([file, names]) => [file, { exports: { all: names } }]),
  );
}

function fieldsOf(module) {
  return Object.fromEntries(
    Object.entries(module).filter(([key]) => key !== 'file' && key !== 'role'),
  );
}

function entryModules(files, all) {
  const bundle = { modules: files.map((file) => ({ file, role: 'production' })) };
  return withEntryPoints(bundle, scannedWith(all))
    .modules.filter((module) => Object.keys(module).length > 2)
    .map((module) => [module.file, fieldsOf(module)]);
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
      'src/shop/orders/__init__.py': null,
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
