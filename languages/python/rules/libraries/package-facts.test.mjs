import { afterEach, describe, expect, it } from 'vitest';
import { createFakeProjects } from '../../adapters/test-support/fake-project.mjs';
import { readPackageFacts } from './package-facts.mjs';

const fakes = createFakeProjects();
const BACKEND = '[build-system]\nbuild-backend = "hatchling.build"\n';

afterEach(() => {
  fakes.cleanup();
});

function factsOf(pyproject, files = {}) {
  return readPackageFacts(
    fakes.project(pyproject === undefined ? files : { 'pyproject.toml': pyproject, ...files }),
  );
}

describe('whether the project is a published package', () => {
  it.each([
    ['a named [project] with a build backend', `[project]\nname = "shop"\n${BACKEND}`, true],
    [
      'a named poetry package with a build backend',
      `[tool.poetry]\nname = "shop"\n${BACKEND}`,
      true,
    ],
    ['no [build-system]', '[project]\nname = "shop"\n', false],
    [
      'a [build-system] without a backend, which builds with setuptools',
      '[project]\nname = "shop"\n[build-system]\nrequires = ["setuptools"]\n',
      true,
    ],
    ['no name', `[project]\nversion = "1"\n${BACKEND}`, false],
    [
      'the classifier that blocks uploads',
      `[project]\nname = "shop"\nclassifiers = ["Private :: Do Not Upload"]\n${BACKEND}`,
      false,
    ],
    [
      'a poetry project in non-package mode',
      `[tool.poetry]\nname = "shop"\npackage-mode = false\n${BACKEND}`,
      false,
    ],
    ['no pyproject.toml', undefined, false],
  ])('%s', (_name, pyproject, published) => {
    expect(factsOf(pyproject).published).toBe(published);
  });

  it.each([
    ['a setup.cfg with a name', { 'setup.cfg': '[metadata]\nname = shop\n' }, true],
    ['a setup.py that names the package', { 'setup.py': 'setup(name="shop")\n' }, true],
    [
      'a setup.py with the classifier that blocks uploads',
      { 'setup.py': 'setup(name="shop", classifiers=["Private :: Do Not Upload"])\n' },
      false,
    ],
    [
      'a setup.cfg of tool settings only',
      { 'setup.cfg': '[flake8]\nmax-line-length = 100\n' },
      false,
    ],
  ])('%s', (_name, files, published) => {
    expect(factsOf(undefined, files).published).toBe(published);
  });
});

describe('the entry points the package declares', () => {
  it('reads console, GUI and poetry scripts, without extras', () => {
    const pyproject = [
      '[project]',
      'name = "shop"',
      '[project.scripts]',
      'shop = "shop.cli:main"',
      '[project.gui-scripts]',
      'shop-gui = "shop.gui:run [ui]"',
      '[tool.poetry.scripts]',
      'legacy = "shop.legacy:start"',
      'broken = "no colon"',
    ].join('\n');

    expect(factsOf(pyproject).entryPoints).toEqual([
      'shop.cli:main',
      'shop.gui:run',
      'shop.legacy:start',
    ]);
  });

  it('reads every group of [project.entry-points]', () => {
    const pyproject = [
      '[project]',
      'name = "shop"',
      '[project.entry-points."shop.plugins"]',
      'cart = "shop.plugins.cart:register"',
      '[project.entry-points.pytest11]',
      'shop = "shop.testing.plugin:load"',
    ].join('\n');

    expect(factsOf(pyproject).entryPoints).toEqual([
      'shop.plugins.cart:register',
      'shop.testing.plugin:load',
    ]);
  });
});

describe('the setup files', () => {
  it('reads the entry points of setup.cfg and setup.py, and the modules of every entry', () => {
    const facts = factsOf(
      '[project]\nname = "shop"\n[tool.flit.scripts]\nflit = "shop.flit:run"\n',
      {
        'setup.cfg':
          '[options.entry_points]\nconsole_scripts =\n    shop = shop.cli:main\nshop.plugins =\n    whole = shop.plugin\n',
        'setup.py':
          'from setuptools import setup\nSCRIPTS = {"console_scripts": ["price = shop.pricing:total"]}\nsetup(name="shop", description="a = b", entry_points=SCRIPTS)\n',
      },
    );

    expect([facts.entryPoints, facts.entryModules]).toEqual([
      ['shop.cli:main', 'shop.flit:run', 'shop.pricing:total'],
      ['shop.cli', 'shop.flit', 'shop.plugin', 'shop.pricing'],
    ]);
  });

  it('fails on a setup file it cannot read, as the other project readers do', () => {
    expect(() => factsOf(undefined, { 'setup.cfg/stray.txt': '' })).toThrow(
      'setup.cfg could not be read (EISDIR): fix or remove it',
    );
  });
});

describe('a pyproject.toml that is not valid TOML', () => {
  it('reads as no package here, since the dependency reader fails the run on it', () => {
    expect(factsOf('[project\nname = "shop"\n')).toEqual({
      published: false,
      entryPoints: [],
      entryModules: [],
    });
  });
});
