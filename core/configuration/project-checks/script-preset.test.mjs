import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { javascriptPresetHint, scriptProjectPreset } from './preset-detection.mjs';

const { temporaryRoot } = useGitFixtures();

function project(files) {
  const root = temporaryRoot('nitpicker-script-preset-');
  writeFiles(root, files);
  return root;
}
const HINT =
  'no "preset" is set, so the TypeScript preset runs, but these sources are JavaScript (no TypeScript files or tsconfig.json). Add "preset": "javascript" to nitpicker.config.json, or run `nitpicker init`.';

describe('the JavaScript preset hint', () => {
  it('names the preset to declare for JavaScript sources', () => {
    expect(javascriptPresetHint({}, project({ 'package.json': '{}', 'src/a.js': '' }))).toBe(HINT);
    expect(javascriptPresetHint({}, project({ 'package.json': '{}', 'src/a.cjs': '' }))).toBe(HINT);
  });

  it('stays quiet once a preset is declared', () => {
    const root = project({ 'package.json': '{}', 'src/a.js': '' });

    expect(javascriptPresetHint({ preset: 'javascript' }, root)).toBeUndefined();
    expect(javascriptPresetHint({ preset: 'typescript' }, root)).toBeUndefined();
  });

  it.each([
    ['TypeScript sources', { 'package.json': '{}', 'src/a.js': '', 'src/b.ts': '' }],
    ['a tsconfig.json', { 'package.json': '{}', 'tsconfig.json': '{}', 'src/a.js': '' }],
    ['JSX sources', { 'package.json': '{}', 'src/a.jsx': '' }],
    ['no sources', { 'package.json': '{}' }],
    ['a Java build owning the folder', { 'pom.xml': '', 'src/main/web/a.js': '' }],
  ])('stays quiet for a project with %s', (_name, files) => {
    expect(javascriptPresetHint({}, project(files))).toBeUndefined();
  });

  it('speaks for a package.json project that also has a Java marker', () => {
    const files = { 'package.json': '{}', 'pom.xml': '', 'src/a.js': '' };

    expect(javascriptPresetHint({}, project(files))).toBe(HINT);
  });

  it('looks in the configured source roots', () => {
    const root = project({ 'package.json': '{}', 'web/a.js': '' });

    expect(javascriptPresetHint({ layout: { sourceRoots: ['web'] } }, root)).toBe(HINT);
    expect(javascriptPresetHint({}, root)).toBeUndefined();
  });
});

describe('the preset of a script project', () => {
  it('is javascript or typescript by the sources, and undefined without any', () => {
    expect(scriptProjectPreset({}, project({ 'src/a.mjs': '' }))).toBe('javascript');
    expect(scriptProjectPreset({}, project({ 'src/a.d.ts': '' }))).toBe('typescript');
    expect(scriptProjectPreset({}, project({ 'package.json': '{}' }))).toBeUndefined();
  });

  it('skips minified files and asset folders', () => {
    const files = { 'package.json': '{}', 'src/app.min.js': '', 'src/static/a.js': '' };

    expect(scriptProjectPreset({}, project(files))).toBeUndefined();
  });

  it('is typescript when a test root holds .jsx or .tsx, which the javascript preset refuses', () => {
    const files = { 'package.json': '{}', 'src/a.js': '', 'test/view.test.jsx': '' };

    expect(scriptProjectPreset({}, project(files))).toBe('typescript');
    expect(javascriptPresetHint({}, project(files))).toBeUndefined();
  });

  it('leaves an excluded .jsx file out, like the javascript preset does', () => {
    const files = { 'package.json': '{}', 'src/a.js': '', 'test/legacy/view.test.jsx': '' };

    expect(scriptProjectPreset({ exclude: ['test/legacy/**'] }, project(files))).toBe('javascript');
  });
});
