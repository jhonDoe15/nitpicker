import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  boundaryRoots,
  dependencyNames,
  detectLibraries,
  validatorsOf,
} from './project-libraries.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-libraries-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

describe('the dependencies a project declares', () => {
  it('come from pyproject.toml in every table that lists them', () => {
    const root = project({
      'pyproject.toml': [
        '[project]',
        'dependencies = ["Structlog>=24", "typing-extensions"]',
        '[project.optional-dependencies]',
        'dev = ["msgspec[json]==0.18"]',
        '[dependency-groups]',
        'test = ["pytest"]',
        '[tool.poetry.dependencies]',
        'python = "^3.11"',
        'loguru = "^0.7"',
        '[tool.poetry.group.dev.dependencies]',
        'marshmallow = "*"',
      ].join('\n'),
    });

    expect([...dependencyNames(root)].sort()).toEqual([
      'loguru',
      'marshmallow',
      'msgspec',
      'pytest',
      'structlog',
      'typing-extensions',
    ]);
  });

  it('come from requirements files and a Pipfile', () => {
    const root = project({
      'requirements.txt': '# pinned\nstructlog==24.1.0\n-r other.txt\n',
      'requirements/dev.in': 'pydantic-settings\n',
      Pipfile: '[packages]\nloguru = "*"\n',
    });

    expect(dependencyNames(root)).toEqual(new Set(['structlog', 'pydantic-settings', 'loguru']));
  });

  it('stay empty for a project without dependency files and fail on a broken one', () => {
    expect(dependencyNames(project({}))).toEqual(new Set());
    expect(() => dependencyNames(project({ 'pyproject.toml': '[project\n' }))).toThrow(
      /Invalid TOML document/,
    );
  });
});

describe('the libraries a project uses', () => {
  it('default to logging and pydantic', () => {
    expect(detectLibraries(project({}))).toEqual({
      logging: 'logging',
      validator: 'pydantic',
      validators: ['pydantic'],
    });
  });

  it.each([
    ['structlog', 'structlog>=24', 'structlog'],
    ['loguru', 'loguru', 'loguru'],
  ])('name %s for logging', (_name, requirement, expected) => {
    const root = project({ 'requirements.txt': `${requirement}\n` });

    expect(detectLibraries(root).logging).toBe(expected);
  });

  it.each([
    ['msgspec', 'msgspec', 'msgspec'],
    ['cattrs', 'cattrs', 'cattrs'],
    ['attrs', 'attrs', 'cattrs'],
    ['marshmallow', 'marshmallow-dataclass', 'marshmallow'],
    ['pydantic', 'pydantic>=2', 'pydantic'],
    ['pydantic-settings', 'pydantic-settings', 'pydantic'],
    ['dataclasses-json', 'dataclasses_json', 'dataclasses-json'],
    ['voluptuous', 'voluptuous', 'voluptuous'],
    ['cerberus', 'Cerberus', 'cerberus'],
  ])('name %s for validation', (_name, requirement, expected) => {
    const root = project({ 'requirements.txt': `${requirement}\n` });

    expect(detectLibraries(root).validator).toBe(expected);
  });

  it('puts the runtime libraries before the development ones', () => {
    const root = project({
      'pyproject.toml': [
        '[project]',
        'dependencies = ["marshmallow"]',
        '[dependency-groups]',
        'dev = ["pydantic", "loguru"]',
        '',
      ].join('\n'),
      'requirements.txt': 'structlog\n',
    });

    expect(detectLibraries(root)).toEqual({
      logging: 'structlog',
      validator: 'marshmallow',
      validators: ['marshmallow', 'pydantic'],
    });
  });

  it('reads Poetry and setup.cfg manifests', () => {
    const poetry = project({
      'pyproject.toml':
        '[tool.poetry.dependencies]\npython = "^3.10"\nmsgspec = "*"\nloguru = "*"\n',
    });
    const setup = project({ 'setup.cfg': '[options]\ninstall_requires =\n    voluptuous\n' });

    expect(detectLibraries(poetry)).toEqual({
      logging: 'loguru',
      validator: 'msgspec',
      validators: ['msgspec'],
    });
    expect(detectLibraries(setup)).toEqual({
      logging: 'logging',
      validator: 'voluptuous',
      validators: ['voluptuous'],
    });
  });
});

describe('the import roots the validation boundary guards', () => {
  it('are the ones of pydantic when no library is declared', () => {
    expect(boundaryRoots(undefined)).toEqual(['pydantic', 'pydantic_settings']);
    expect(validatorsOf(undefined)).toEqual(['pydantic']);
  });

  it('are the ones of every declared library', () => {
    expect(boundaryRoots({ validators: ['marshmallow', 'cattrs'] })).toEqual([
      'marshmallow',
      'marshmallow_dataclass',
      'cattrs',
    ]);
  });
});
