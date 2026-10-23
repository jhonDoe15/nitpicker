import { describe, expect, it } from 'vitest';
import { normalizeProjectPath, validateExtends, validateProjects } from './settings.mjs';

const PRESETS = ['typescript', 'python', 'java'];

describe('"extends"', () => {
  it('accepts a relative path to a JSON file', () => {
    expect(() => {
      validateExtends('../base.json');
    }).not.toThrow();
  });

  it.each([
    [42, 'must be the path of a JSON config file'],
    ['', 'must be the path of a JSON config file'],
    ['/etc/base.json', 'must be a relative path inside the repository'],
    ['C:/base.json', 'must be a relative path inside the repository'],
    ['../base.yaml', 'must name a .json file'],
  ])('rejects %j', (value, message) => {
    expect(() => {
      validateExtends(value);
    }).toThrow(message);
  });
});

describe('normalizeProjectPath', () => {
  it.each([
    ['web', 'web'],
    ['./web/', 'web'],
    ['services\\api', 'services/api'],
    ['services//api/./x', 'services/api/x'],
    ['.', '.'],
    ['./', '.'],
  ])('turns %j into %j', (value, expected) => {
    expect(normalizeProjectPath(value)).toBe(expected);
  });
});

describe('"projects"', () => {
  it('reads paths and objects into entries', () => {
    expect(
      validateProjects(
        ['web', { path: './services/api/', preset: 'python' }, { path: 'app' }],
        PRESETS,
      ),
    ).toEqual([{ path: 'web' }, { path: 'services/api', preset: 'python' }, { path: 'app' }]);
  });

  it('accepts an empty list, which keeps the repository one project', () => {
    expect(validateProjects([], PRESETS)).toEqual([]);
  });

  it.each([
    ['web', '"projects" must be an array of project folders'],
    [[42], '"projects[0]" must be a path or an object'],
    [[''], '"projects[0]" must be a non-empty string'],
    [['../outside'], '"projects[0]" must be a path inside the project'],
    [['/abs'], '"projects[0]" must be a path inside the project'],
    [
      [{ path: 'a', preset: 'cobol' }],
      '"projects[0].preset" must be one of: typescript, python, java',
    ],
    [[{ path: 'a', name: 'x' }], 'unknown key "name" in "projects[0]". Allowed keys: path, preset'],
    [[{ preset: 'python' }], '"projects[0].path" must be a non-empty string'],
    [['web', './web/'], '"projects" lists web twice'],
  ])('rejects %j', (value, message) => {
    expect(() => validateProjects(value, PRESETS)).toThrow(message);
  });
});
