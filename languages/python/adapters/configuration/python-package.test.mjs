import { afterEach, describe, expect, it } from 'vitest';
import { createFakeProjects } from '../test-support/fake-project.mjs';
import { readPackageFacts } from './python-package.mjs';

const fakes = createFakeProjects();
const BACKEND = '[build-system]\nbuild-backend = "hatchling.build"\n';

afterEach(() => {
  fakes.cleanup();
});

function factsOf(pyproject) {
  return readPackageFacts(
    fakes.project(pyproject === undefined ? {} : { 'pyproject.toml': pyproject }),
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
    ['no build backend', '[project]\nname = "shop"\n', false],
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

describe('a pyproject.toml that is not valid TOML', () => {
  it('reads as an unpublished package without entry points and names the problem', () => {
    expect(factsOf('[project\nname = "shop"\n')).toEqual({
      published: false,
      entryPoints: [],
      invalidFiles: [
        {
          file: 'pyproject.toml',
          line: 1,
          problem: 'Invalid TOML document: illegal character in key (line 1, column 9)',
        },
      ],
    });
  });

  it('has no problem when the file is valid or absent', () => {
    expect(factsOf('[project]\nname = "shop"\n').invalidFiles).toEqual([]);
    expect(factsOf(undefined).invalidFiles).toEqual([]);
  });
});
