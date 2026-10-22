import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readConfigFile } from '../../configuration/config.mjs';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { readLayeredConfig } from './read-layered.mjs';
import { sharedConfigBlobs, sharedConfigFiles } from './shared-files.mjs';

const git = useGitFixtures();

function repository(files) {
  return git.createGitRepository(files, { prefix: 'nitpicker-layered-' }).root;
}

function load(root, folder = 'web', options) {
  return readLayeredConfig(path.join(root, folder), options);
}

describe('a project config without "extends"', () => {
  it('reads as before, and an absent file is an empty config', () => {
    const root = repository({
      'web/nitpicker.config.json': '{"preset":"javascript"}',
      'api/a': '',
    });

    expect(load(root)).toEqual({ preset: 'javascript' });
    expect(load(root, 'api')).toEqual({});
  });

  it('keeps the old messages for a config that is not an object or has an unknown key', () => {
    const root = repository({
      'web/nitpicker.config.json': '[]',
      'api/nitpicker.config.json': '{"colour":"red"}',
    });

    expect(() => load(root)).toThrow('nitpicker.config.json: must be a JSON object');
    expect(() => load(root, 'api')).toThrow('nitpicker.config.json: unknown key "colour"');
  });

  it('leaves "projects" out of the config a project runs with', () => {
    const root = repository({ 'nitpicker.config.json': '{"projects":["web"],"disable":["knip"]}' });

    expect(load(root, '.')).toEqual({ disable: ['knip'] });
  });

  it('rejects a malformed "projects" list', () => {
    const root = repository({ 'nitpicker.config.json': '{"projects":"web"}' });

    expect(() => load(root, '.')).toThrow('"projects" must be an array of project folders');
  });
});

describe('a project config that extends a shared one', () => {
  const files = {
    'base.json': JSON.stringify({
      base: 'origin/develop',
      thresholds: { crapLimit: 8, fileLines: 200 },
      exclude: ['generated/**'],
      projects: ['ignored'],
    }),
    'web/nitpicker.config.json': JSON.stringify({
      extends: '../base.json',
      thresholds: { fileLines: 250 },
    }),
  };

  it('applies the shared settings and lets the project override what it sets', () => {
    expect(load(repository(files))).toEqual({
      base: 'origin/develop',
      thresholds: { crapLimit: 8, fileLines: 250 },
      exclude: ['generated/**'],
    });
  });

  it('does not carry "extends" or "projects" into the merged config', () => {
    const merged = load(repository(files));

    expect(Object.keys(merged)).not.toContain('extends');
    expect(Object.keys(merged)).not.toContain('projects');
  });

  it('is what readConfigFile returns, so the base side reads its own copy of the shared file', () => {
    const root = repository(files);

    expect(readConfigFile(path.join(root, 'web'), { repositoryRoot: root }).base).toBe(
      'origin/develop',
    );
  });

  it('takes the exceptions of the shared file and checks them', () => {
    const exception = { rule: 'file-lines-limit', paths: ['a/**'], reason: 'generated tables' };
    const root = repository({
      'base.json': JSON.stringify({ exceptions: [exception] }),
      'web/nitpicker.config.json': '{"extends":"../base.json"}',
      'api/nitpicker.config.json': '{"extends":"../bad.json"}',
      'bad.json': JSON.stringify({ exceptions: [{ ...exception, reason: '' }] }),
    });

    expect(load(root).exceptions).toEqual([exception]);
    expect(() => load(root, 'api')).toThrow('bad.json: "exceptions[0].reason"');
  });

  it.each([
    ['has an unknown key', '{"colour":"red"}', 'base.json: unknown key "colour"'],
    [
      'has a malformed "projects" list',
      '{"projects":[1]}',
      'base.json: "projects[0]" must be a path or an object',
    ],
    ['is not a JSON object', '"text"', 'base.json: must be a JSON object'],
    [
      'makes the merged config invalid',
      '{"thresholds":{"crapLimit":-1}}',
      'base.json: "thresholds.crapLimit" must be a positive number',
    ],
  ])('names the shared file when it %s', (_case, shared, message) => {
    const root = repository({ ...files, 'base.json': shared });

    expect(() => load(root)).toThrow(message);
  });

  it('names the project file when its own setting is invalid', () => {
    const root = repository({
      ...files,
      'web/nitpicker.config.json': '{"extends":"../base.json","thresholds":{"fileLines":0}}',
    });

    expect(() => load(root)).toThrow('nitpicker.config.json: "thresholds.fileLines"');
  });

  it('judges a shared setting against the preset the project sets', () => {
    const root = repository({
      'base.json': '{"thresholds":{"classMethods":9}}',
      'web/nitpicker.config.json': '{"extends":"../base.json","preset":"java"}',
      'api/nitpicker.config.json': '{"extends":"../base.json"}',
    });

    expect(load(root).thresholds).toEqual({ classMethods: 9 });
    expect(() => load(root, 'api')).toThrow(
      'base.json: "thresholds.classMethods" is only supported with "preset"',
    );
  });

  it('reports an error that no file causes as it is', () => {
    const root = repository({ 'api/a': '' });

    expect(() => load(root, 'api', { overlay: { preset: 'cobol', declared: true } })).toThrow(
      'nitpicker.config.json: "preset" must be one of',
    );
  });
});

describe('the preset a "projects" entry or detection gives a project', () => {
  it('fills in a preset the config leaves out', () => {
    const root = repository({ 'api/a': '' });

    expect(load(root, 'api', { overlay: { preset: 'python', declared: true } })).toEqual({
      preset: 'python',
    });
  });

  it('accepts the preset the config already sets', () => {
    const root = repository({ 'api/nitpicker.config.json': '{"preset":"python"}' });

    expect(load(root, 'api', { overlay: { preset: 'python', declared: true } }).preset).toBe(
      'python',
    );
  });

  it('refuses a listed preset that contradicts the config', () => {
    const root = repository({ 'api/nitpicker.config.json': '{"preset":"java"}' });

    expect(() => load(root, 'api', { overlay: { preset: 'python', declared: true } })).toThrow(
      '"projects" lists this project with "preset": "python", but its config sets "preset": "java"',
    );
  });

  it('lets the config win over a detected preset', () => {
    const root = repository({ 'api/nitpicker.config.json': '{"preset":"java"}' });

    expect(load(root, 'api', { overlay: { preset: 'python', declared: false } }).preset).toBe(
      'java',
    );
  });
});

describe('the shared files of a project', () => {
  function sharedRepository() {
    return repository({
      'base.json': '{}',
      'team/shared.json': '{"extends":"../base.json"}',
      'web/nitpicker.config.json': '{"extends":"../team/shared.json"}',
      'api/nitpicker.config.json': '{}',
    });
  }

  it('lists the files the config extends, not its own', () => {
    const root = sharedRepository();
    expect(sharedConfigFiles(path.join(root, 'web')).map(({ label }) => label)).toEqual([
      'base.json',
      'team/shared.json',
    ]);
    expect(sharedConfigFiles(path.join(root, 'api'))).toEqual([]);
    expect(sharedConfigFiles(path.join(root, 'missing'))).toEqual([]);
  });

  it('hashes their content for the policy digest', () => {
    const root = sharedRepository();
    const blobs = sharedConfigBlobs(path.join(root, 'web'), (content) => `blob:${content.length}`);

    expect(blobs).toEqual([
      ['base.json', 'blob:2'],
      ['team/shared.json', 'blob:26'],
    ]);
  });
});
