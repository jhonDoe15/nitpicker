import { describe, expect, it } from 'vitest';
import { useProjects } from '../../../../core/init/test-support/projects.mjs';
import { EMPTY_SOURCES_TOOL, emptySourcesErrors, emptySourcesMessage } from './empty-sources.mjs';
import { linkSentence } from '../../../../shared/messages/test-support/link-sentence.mjs';

const project = useProjects();
const CODE = 'export const value = 1;\n';
const WORKSPACE = { 'package.json': '{}', 'packages/a/src/index.ts': CODE };

describe('emptySourcesMessage', () => {
  it('suggests the package source folders when sources sit outside the layout', () => {
    const files = { ...WORKSPACE, 'packages/b/src/index.ts': CODE, 'app/main.ts': CODE };

    expect(emptySourcesMessage({}, project(files), {})).toBe(
      'No TypeScript or JavaScript files under src; nothing was analyzed. Set "layout.sourceRoots" ' +
        '(this repository has TypeScript files under app, packages/a/src, packages/b/src).',
    );
  });

  it('caps the suggested folders and counts the rest', () => {
    const files = Object.fromEntries(
      ['a', 'b', 'c', 'd', 'e'].map((name) => [`${name}/index.js`, CODE]),
    );

    expect(emptySourcesMessage({ preset: 'javascript' }, project(files), {})).toBe(
      'No TypeScript or JavaScript files under src; nothing was analyzed. Set "layout.sourceRoots" ' +
        '(this repository has JavaScript files under a, b, c, and 2 more).',
    );
  });

  it('names the configured roots and asks for roots when the repository has no code', () => {
    const policy = { layout: { sourceRoots: ['lib', 'app'] } };

    expect(emptySourcesMessage({}, project({ 'package.json': '{}' }), policy)).toBe(
      'No TypeScript or JavaScript files under lib, app; nothing was analyzed. ' +
        'Set "layout.sourceRoots" to the folders that hold the code.',
    );
  });

  it('ignores dependency, build output, hidden, declaration and tool configuration files', () => {
    const files = {
      'package.json': '{}',
      'node_modules/x/index.ts': CODE,
      'dist/out.js': CODE,
      '.storybook/main.ts': CODE,
      'types/global.d.ts': CODE,
      'vite.config.ts': CODE,
    };

    expect(emptySourcesMessage({}, project(files), {})).toBe(
      'No TypeScript or JavaScript files under src; nothing was analyzed. ' +
        'Set "layout.sourceRoots" to the folders that hold the code.',
    );
  });

  it('stays quiet when a source root or a test root holds code', () => {
    expect(emptySourcesMessage({}, project({ 'src/a.ts': CODE }), {})).toBeUndefined();
    expect(emptySourcesMessage({}, project({ 'test/a.test.ts': CODE }), {})).toBeUndefined();
  });

  it('stays quiet for presets of other languages', () => {
    expect(emptySourcesMessage({ preset: 'python' }, project(WORKSPACE), {})).toBeUndefined();
  });

  it('stays quiet without a preset in a project of another language', () => {
    const files = { 'pom.xml': '<project/>', 'src/main/java/A.java': 'class A {}\n', 'app.py': '' };

    expect(emptySourcesMessage({}, project(files), {})).toBeUndefined();
  });
});

describe('emptySourcesErrors', () => {
  it('reports one head tool error with the message', () => {
    const root = project(WORKSPACE);

    expect(emptySourcesErrors({ preset: 'typescript' }, root, { headPolicy: {} })).toEqual([
      {
        tool: EMPTY_SOURCES_TOOL,
        snapshot: 'head',
        rule: 'empty-sources',
        path: '',
        message:
          'No TypeScript or JavaScript files under src; nothing was analyzed. Set "layout.sourceRoots" ' +
          `(this repository has TypeScript files under packages/a/src). ${linkSentence('emptySourceRoots')}`,
      },
    ]);
  });

  it('reports nothing when the run is narrowed to some analyzers', () => {
    const errors = emptySourcesErrors({}, project(WORKSPACE), {
      headPolicy: {},
      analyzerNames: ['repository-hygiene'],
    });

    expect(errors).toEqual([]);
  });

  it('reports nothing when sources are analyzed', () => {
    expect(emptySourcesErrors({}, project({ 'src/a.ts': CODE }), { headPolicy: {} })).toEqual([]);
  });
});
