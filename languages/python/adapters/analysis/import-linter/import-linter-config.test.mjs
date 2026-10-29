import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readImportLinterConfig } from './import-linter-config.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-import-linter-config-')));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const INI = '[importlinter]\nroot_package = shop\n';
const TOML = '[tool.importlinter]\nroot_package = "store"\n';

describe('the import-linter config the contracts come from', () => {
  it('reads setup.cfg, then .importlinter, then pyproject.toml, as import-linter does', () => {
    const fileOf = (files) => readImportLinterConfig(project(files))?.file;

    expect(fileOf({ 'setup.cfg': INI, '.importlinter': INI, 'pyproject.toml': TOML })).toBe(
      'setup.cfg',
    );
    expect(fileOf({ 'setup.cfg': '[metadata]\n', '.importlinter': INI })).toBe('.importlinter');
    expect(fileOf({ '.importlinter': '[other]\n', 'pyproject.toml': TOML })).toBe('pyproject.toml');
    expect(fileOf({ 'tox.ini': INI })).toBe(undefined);
  });

  it('reads the contracts of an ini file with their lists', () => {
    const root = project({
      '.importlinter': `${INI}\n[importlinter:contract:layers]\nname = Layers\ntype = layers\nlayers =\n    shop.api\n    shop.domain\n`,
    });

    expect(readImportLinterConfig(root)).toEqual({
      file: '.importlinter',
      session: { root_package: 'shop' },
      contracts: [
        {
          id: 'layers',
          options: { name: 'Layers', type: 'layers', layers: ['shop.api', 'shop.domain'] },
        },
      ],
    });
  });

  it('reads the contracts of pyproject.toml with booleans spelled as import-linter does', () => {
    const root = project({
      'pyproject.toml': `${TOML}\n[[tool.importlinter.contracts]]\nname = "No db"\ntype = "forbidden"\nsource_modules = ["store.api"]\nforbidden_modules = ["store.db"]\nallow_indirect_imports = true\n`,
    });

    expect(readImportLinterConfig(root)).toEqual({
      file: 'pyproject.toml',
      session: { root_package: 'store' },
      contracts: [
        {
          id: 'No db',
          options: {
            name: 'No db',
            type: 'forbidden',
            source_modules: ['store.api'],
            forbidden_modules: ['store.db'],
            allow_indirect_imports: 'True',
          },
        },
      ],
    });
  });

  it('names the file that does not parse', () => {
    const root = project({ 'pyproject.toml': '[tool.importlinter\n' });

    expect(() => readImportLinterConfig(root)).toThrow(/^pyproject\.toml: /);
  });
});
