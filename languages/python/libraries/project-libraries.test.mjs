import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectPythonLibraries, loggerBehavior, validationBehavior } from './project-libraries.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-libraries-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

describe('detecting the libraries of a project', () => {
  it.each([
    ['pydantic', 'pydantic>=2', ['pydantic']],
    ['pydantic-settings', 'pydantic-settings', ['pydantic']],
    ['attrs and cattrs', 'attrs\ncattrs', ['attrs']],
    ['marshmallow', 'marshmallow-dataclass', ['marshmallow']],
    ['msgspec', 'msgspec', ['msgspec']],
    ['dataclasses-json', 'dataclasses_json', ['dataclasses-json']],
    ['voluptuous', 'voluptuous', ['voluptuous']],
    ['cerberus', 'Cerberus', ['cerberus']],
    ['nothing known', 'requests', []],
  ])('finds %s in requirements.txt', (_name, requirements, expected) => {
    const root = project({ 'requirements.txt': `${requirements}\n` });

    expect(detectPythonLibraries(root).validation).toEqual(expected);
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

    expect(detectPythonLibraries(root)).toEqual({
      validation: ['marshmallow', 'pydantic'],
      logger: ['structlog', 'loguru'],
    });
  });

  it('reads Poetry and setup.cfg manifests', () => {
    const poetry = project({
      'pyproject.toml':
        '[tool.poetry.dependencies]\npython = "^3.10"\nmsgspec = "*"\nloguru = "*"\n',
    });
    const setup = project({ 'setup.cfg': '[options]\ninstall_requires =\n    voluptuous\n' });

    expect(detectPythonLibraries(poetry)).toEqual({ validation: ['msgspec'], logger: ['loguru'] });
    expect(detectPythonLibraries(setup)).toEqual({ validation: ['voluptuous'], logger: [] });
  });
});

describe('the validation behavior', () => {
  it('defaults to pydantic when nothing is detected', () => {
    const behavior = validationBehavior({ validation: [] });

    expect([behavior.names, behavior.importRoots, behavior.primary.call]).toEqual([
      ['pydantic'],
      ['pydantic', 'pydantic_settings'],
      'Model.model_validate(data)',
    ]);
    expect(validationBehavior(undefined).names).toEqual(['pydantic']);
  });

  it('accepts every detected library and names the first as the primary', () => {
    const behavior = validationBehavior({ validation: ['marshmallow', 'attrs'] });

    expect(behavior.names).toEqual(['marshmallow', 'attrs']);
    expect(behavior.importRoots).toEqual(['marshmallow', 'marshmallow_dataclass', 'cattrs']);
    expect(behavior.primary.id).toBe('marshmallow');
    expect(behavior.libraryOf('cattrs.preconf')?.id).toBe('attrs');
    expect(behavior.libraryOf('pydantic')).toBeUndefined();
  });
});

describe('the logger behavior', () => {
  it('is the standard library logger unless structlog or loguru is detected', () => {
    expect(loggerBehavior(undefined).id).toBe('logging');
    expect(loggerBehavior({ logger: [] }).id).toBe('logging');
    expect(loggerBehavior({ logger: ['loguru', 'structlog'] }).id).toBe('loguru');
    expect(loggerBehavior({ logger: ['structlog'] }).caught).toBe(
      'Pass the caught exception to the logger: `logger.exception("event")`, or `logger.error("event", exc_info=True)`.',
    );
  });
});
