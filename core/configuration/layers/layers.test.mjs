import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { parseConfigFile, readLayers, repositoryRootOf } from './layers.mjs';

const git = useGitFixtures();

function repository(files) {
  return git.createGitRepository(files, { prefix: 'nitpicker-layers-' }).root;
}

function layersOf(root, configFolder) {
  return readLayers(path.join(root, configFolder, 'nitpicker.config.json'));
}

describe('reading a config and what it extends', () => {
  it('returns one layer for a config that extends nothing', () => {
    const root = repository({ 'web/nitpicker.config.json': '{"preset":"typescript"}' });

    expect(layersOf(root, 'web').map(({ label, config }) => [label, config])).toEqual([
      ['nitpicker.config.json', { preset: 'typescript' }],
    ]);
  });

  it('puts the most shared config first and follows chains', () => {
    const root = repository({
      'base.json': '{"base":"origin/main"}',
      'shared/team.json': '{"extends":"../base.json","exclude":["a/**"]}',
      'web/nitpicker.config.json': '{"extends":"../shared/team.json"}',
    });

    expect(layersOf(root, 'web').map(({ label }) => label)).toEqual([
      'base.json',
      'shared/team.json',
      'nitpicker.config.json',
    ]);
  });

  it('refuses a cycle and shows it', () => {
    const root = repository({
      'a.json': '{"extends":"b.json"}',
      'b.json': '{"extends":"a.json"}',
      'web/nitpicker.config.json': '{"extends":"../a.json"}',
    });

    expect(() => layersOf(root, 'web')).toThrow(
      'b.json: "extends" forms a cycle: nitpicker.config.json -> a.json -> b.json -> a.json',
    );
  });

  it('refuses a config that extends itself', () => {
    const root = repository({ 'web/nitpicker.config.json': '{"extends":"nitpicker.config.json"}' });

    expect(() => layersOf(root, 'web')).toThrow('forms a cycle');
  });

  it('refuses a path that leaves the repository', () => {
    const root = repository({ 'web/nitpicker.config.json': '{"extends":"../../outside.json"}' });

    expect(() => layersOf(root, 'web')).toThrow(
      'nitpicker.config.json: "extends" ../../outside.json leaves the repository',
    );
  });

  it('refuses a symbolic link that resolves outside the repository', () => {
    const outside = git.temporaryRoot('nitpicker-layers-outside-');
    writeFileSync(path.join(outside, 'secret.json'), '{}');
    const root = repository({ 'web/nitpicker.config.json': '{"extends":"../link.json"}' });
    symlinkSync(path.join(outside, 'secret.json'), path.join(root, 'link.json'));

    expect(() => layersOf(root, 'web')).toThrow('resolves outside the repository');
  });

  it('names the extending file when the shared one is missing', () => {
    const root = repository({ 'web/nitpicker.config.json': '{"extends":"../missing.json"}' });

    expect(() => layersOf(root, 'web')).toThrow(
      'nitpicker.config.json: "extends" points at ../missing.json, which is not a file',
    );
  });

  it('names the shared file that is not valid JSON', () => {
    const root = repository({
      'base.json': '{ nope',
      'web/nitpicker.config.json': '{"extends":"../base.json"}',
    });

    expect(() => layersOf(root, 'web')).toThrow('base.json is not valid JSON');
  });

  it('names the file whose "extends" is malformed', () => {
    const root = repository({
      'base.json': '{"extends":"other.yaml"}',
      'web/nitpicker.config.json': '{"extends":"../base.json"}',
    });

    expect(() => layersOf(root, 'web')).toThrow('base.json: "extends" must name a .json file');
  });

  it('refuses an "extends" of null or of a file that is not JSON', () => {
    const empty = repository({ 'web/nitpicker.config.json': '{"extends":null}' });
    const yaml = repository({ 'web/nitpicker.config.json': '{"extends":"../base.yaml"}' });

    expect(() => layersOf(empty, 'web')).toThrow(
      new Error(
        'nitpicker.config.json: "extends" must be the path of a JSON config file, such as "../base.json"',
      ),
    );
    expect(() => layersOf(yaml, 'web')).toThrow(
      new Error('nitpicker.config.json: "extends" must name a .json file: ../base.yaml'),
    );
  });

  it('uses the repository root it is given', () => {
    const root = repository({
      'base.json': '{}',
      'web/nitpicker.config.json': '{"extends":"../base.json"}',
    });
    mkdirSync(path.join(root, 'web/deep'));

    expect(
      readLayers(path.join(root, 'web/nitpicker.config.json'), { repositoryRoot: root }),
    ).toHaveLength(2);
  });

  it('says a git repository is needed to extend', () => {
    const folder = git.temporaryRoot('nitpicker-layers-plain-');
    writeFileSync(path.join(folder, 'base.json'), '{}');
    writeFileSync(path.join(folder, 'nitpicker.config.json'), '{"extends":"base.json"}');

    expect(() => readLayers(path.join(folder, 'nitpicker.config.json'))).toThrow(
      '"extends" needs the project to be inside a git repository',
    );
  });
});

describe('parseConfigFile and repositoryRootOf', () => {
  it('names the file when the JSON is invalid', () => {
    const folder = git.temporaryRoot('nitpicker-layers-parse-');
    writeFileSync(path.join(folder, 'x.json'), '{');

    expect(() => parseConfigFile(path.join(folder, 'x.json'), 'x.json')).toThrow(
      'x.json is not valid JSON',
    );
  });

  it('finds the top of the repository from a folder inside it', () => {
    const root = repository({ 'web/a.txt': 'x' });

    expect(repositoryRootOf(path.join(root, 'web'))).toBe(root);
  });
});
