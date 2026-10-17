import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBaseSetupResolver } from '../../command/policy-review/base-setup.mjs';
import {
  commitHead,
  compare,
  createMoveRepositories,
  filler,
  finding,
  git,
  identities,
  move,
  probeAnalyzer,
  write,
} from './test-support/move-repositories.mjs';

const createRepository = createMoveRepositories();

describe('a folder move without edits', () => {
  it('reports no new findings', () => {
    const root = createRepository({
      'src/a.mjs': `${filler('a')}${finding('a-site')}`,
      'src/nested/b.mjs': `${filler('b')}${finding('b-site')}`,
    });
    move(root, 'src/a.mjs', 'lib/a.mjs');
    move(root, 'src/nested/b.mjs', 'lib/nested/b.mjs');
    commitHead(root);

    const report = compare(root, {
      headPolicy: { layout: { sourceRoots: ['lib'] } },
      resolveBaseSetup: () => ({
        headPolicy: { layout: { sourceRoots: ['src'] } },
      }),
    });

    expect(identities(report.newFindings)).toEqual([]);
    expect(identities(report.resolvedFindings)).toEqual([]);
    expect(report.unchangedFindings).toHaveLength(2);
    expect(report.summary.renamedPaths).toBe(2);
  });

  it('keeps the old behaviour for a repository that did not move', () => {
    const root = createRepository({
      'src/a.mjs': `${filler('a')}${finding('a-site')}`,
    });
    write(root, { 'src/c.mjs': `${filler('c')}${finding('c-site')}` });
    commitHead(root);

    const report = compare(root);

    expect(identities(report.newFindings)).toEqual(['c-site']);
    expect(report.summary.renamedPaths).toBe(0);
  });
});

describe('a folder move with a new violation', () => {
  it('reports exactly the new violation', () => {
    const root = createRepository({
      'src/a.mjs': `${filler('a')}${finding('a-site')}`,
      'src/b.mjs': `${filler('b')}${finding('b-site')}`,
    });
    move(root, 'src/a.mjs', 'lib/a.mjs');
    move(root, 'src/b.mjs', 'lib/b.mjs');
    write(root, { 'lib/fresh.mjs': `${filler('f')}${finding('fresh-site')}` });
    commitHead(root);

    const report = compare(root, {
      headPolicy: { layout: { sourceRoots: ['lib'] } },
      resolveBaseSetup: () => ({
        headPolicy: { layout: { sourceRoots: ['src'] } },
      }),
    });

    expect(identities(report.newFindings)).toEqual(['fresh-site']);
    expect(report.newFindings[0].path).toBe('lib/fresh.mjs');
  });

  it('matches a moved file that was rewritten beyond git similarity because its folder moved', () => {
    const root = createRepository({
      'src/a.mjs': `${filler('a')}${finding('a-site')}`,
      'src/b.mjs': `${filler('b')}${finding('b-site')}`,
      'src/rewritten.mjs': `${filler('r')}${finding('r-site')}`,
    });
    move(root, 'src/a.mjs', 'lib/a.mjs');
    move(root, 'src/b.mjs', 'lib/b.mjs');
    git(root, 'rm', '-q', 'src/rewritten.mjs');
    write(root, {
      'lib/rewritten.mjs': `${filler('totally-different')}${filler('other')}${filler('more')}${finding('r-site')}`,
    });
    commitHead(root);

    const report = compare(root, {
      headPolicy: { layout: { sourceRoots: ['lib'] } },
      resolveBaseSetup: () => ({
        headPolicy: { layout: { sourceRoots: ['src'] } },
      }),
    });

    expect(identities(report.newFindings)).toEqual([]);
    expect(report.unchangedFindings).toHaveLength(3);
  });
});

describe('a project whose root moved', () => {
  it('analyses the base where the package was and matches findings through the move', () => {
    const root = createRepository({
      'packages/app/package.json': '{"name":"app"}\n',
      'packages/app/src/a.mjs': `${filler('a')}${finding('a-site')}`,
      'packages/app/src/b.mjs': `${filler('b')}${finding('b-site')}`,
    });
    move(root, 'packages/app/package.json', 'package.json');
    move(root, 'packages/app/src/a.mjs', 'src/a.mjs');
    move(root, 'packages/app/src/b.mjs', 'src/b.mjs');
    write(root, { 'src/c.mjs': `${filler('c')}${finding('c-site')}` });
    commitHead(root);

    const report = compare(root);

    expect(identities(report.newFindings)).toEqual(['c-site']);
    expect(report.unchangedFindings).toHaveLength(2);
  });

  it('follows a package that moved into a subdirectory', () => {
    const root = createRepository({
      'package.json': '{"name":"app"}\n',
      'src/a.mjs': `${filler('a')}${finding('a-site')}`,
    });
    move(root, 'package.json', 'typescript/package.json');
    move(root, 'src/a.mjs', 'typescript/src/a.mjs');
    commitHead(root);

    const report = compare(root, { projectRelativePath: 'typescript' });

    expect(identities(report.newFindings)).toEqual([]);
    expect(report.unchangedFindings).toHaveLength(1);
  });
});

describe('a config that changed between base and head', () => {
  const baseFiles = {
    'nitpicker.config.json': '{"layout":{"sourceRoots":["legacy"]}}\n',
    'legacy/a.mjs': `${filler('a')}${finding('a-site')}`,
    'legacy/b.mjs': `${filler('b')}${finding('b-site')}`,
  };

  function moveToSrc(root) {
    git(root, 'rm', '-q', 'nitpicker.config.json');
    write(root, {
      'nitpicker.config.json': '{"layout":{"sourceRoots":["src"]}}\n',
    });
    move(root, 'legacy/a.mjs', 'src/a.mjs');
    move(root, 'legacy/b.mjs', 'src/b.mjs');
    commitHead(root);
  }

  it('analyses the base with the base config', () => {
    const root = createRepository(baseFiles);
    moveToSrc(root);

    const report = compare(root, {
      headPolicy: { layout: { sourceRoots: ['src'] } },
      resolveBaseSetup: createBaseSetupResolver({
        headConfig: { layout: { sourceRoots: ['src'] } },
        injectedAnalyzers: [probeAnalyzer()],
      }),
    });

    expect(report.summary.overallStatus).toBe('completed');
    expect(identities(report.newFindings)).toEqual([]);
    expect(report.unchangedFindings).toHaveLength(2);
  });

  it('is what makes the difference: the head config alone sees nothing on the base', () => {
    const root = createRepository(baseFiles);
    moveToSrc(root);

    const report = compare(root, {
      headPolicy: { layout: { sourceRoots: ['src'] } },
    });

    expect(identities(report.newFindings)).toEqual(['a-site', 'b-site']);
  });

  it('falls back to the head config when the base has none or it does not load', () => {
    const warnings = [];
    const resolve = createBaseSetupResolver({
      headConfig: { exclude: ['src/vendor/**'] },
      injectedAnalyzers: [probeAnalyzer()],
      warn: (message) => warnings.push(message),
    });
    const root = createRepository({
      'nitpicker.config.json': '{not json',
      'src/vendor/a.ts': 'export {};\n',
    });
    const comparedWithDefaults = {
      policyChanges: ['exclude added: src/vendor/**'],
      policyLoosenings: ['exclude added: src/vendor/**'],
      policyDigest: expect.stringMatching(/^[0-9a-f]{12}$/),
    };

    expect(
      resolve({
        baseProjectRoot: root,
        headSnapshotRoot: root,
        analyzers: [probeAnalyzer()],
      }),
    ).toEqual(comparedWithDefaults);
    expect(warnings).toEqual([
      "The base's nitpicker.config.json cannot be applied (nitpicker.config.json is not valid JSON: Expected property name or '}' in JSON at position 1 (line 1 column 2)); the base is analysed with the head config, and the head config is compared with the defaults.",
    ]);
    expect(
      resolve({
        baseProjectRoot: path.join(root, 'missing'),
        headSnapshotRoot: root,
        analyzers: [],
      }).policyLoosenings,
    ).toEqual([
      'exclude and layout.excludedGlobs hide code this change adds or moves where the base config checked it: ' +
        'src/vendor/a.ts',
    ]);
    expect(warnings).toHaveLength(1);
  });

  it('keeps the head analyzers for names the base config does not provide', () => {
    const root = createRepository({
      'nitpicker.config.json': '{"disable":["other"]}\n',
    });
    const headOnly = { ...probeAnalyzer(), name: 'head-only' };
    const resolve = createBaseSetupResolver({
      headConfig: {},
      injectedAnalyzers: [probeAnalyzer(), { ...probeAnalyzer(), name: 'other' }],
    });

    const setup = resolve({
      baseProjectRoot: root,
      headSnapshotRoot: root,
      analyzers: [headOnly],
    });

    expect(setup.analyzers).toEqual([headOnly]);
    expect(setup.headPolicy.exclude).toEqual([]);
  });
});

describe('notices about the change', () => {
  it('passes the changed files to the notice callback and reports what it returns', () => {
    const root = createRepository({ 'src/kept.mjs': filler('kept') });
    write(root, {
      'scripts/new.mjs': filler('new'),
      'src/kept.mjs': `${filler('kept')}// edit\n`,
    });
    commitHead(root);
    const seen = [];

    const report = compare(root, {
      describeNotices: (files) => {
        seen.push(...files);
        return ['a notice'];
      },
    });

    expect(seen.sort()).toEqual(['scripts/new.mjs', 'src/kept.mjs']);
    expect(report.summary.notices).toEqual(['a notice']);
    const lines = report.text.split('\n');
    const start = lines.indexOf('Notices (not failing):');
    expect(lines.slice(start, start + 2)).toEqual(['Notices (not failing):', '  a notice']);
  });

  it('reports no notices without a callback', () => {
    const root = createRepository({ 'src/kept.mjs': filler('kept') });
    write(root, { 'src/kept.mjs': `${filler('kept')}// edit\n` });
    commitHead(root);

    expect(compare(root).summary.notices).toEqual([]);
  });
});

describe('a change that adds a source root', () => {
  const baseConfig = { layout: { sourceRoots: ['src'] } };
  const headConfig = { layout: { sourceRoots: ['src', 'shared'] } };

  it('keeps the legacy findings of the new root baselined and checks new code in it', () => {
    const root = createRepository({
      'nitpicker.config.json': `${JSON.stringify(baseConfig)}\n`,
      'src/a.mjs': `${filler('a')}${finding('a-site')}`,
      'shared/legacy.mjs': `${filler('legacy')}${finding('legacy-site')}`,
    });
    write(root, {
      'nitpicker.config.json': `${JSON.stringify(headConfig)}\n`,
      'shared/added.mjs': `${filler('added')}${finding('added-site')}`,
    });
    commitHead(root);

    const report = compare(root, {
      headPolicy: headConfig,
      resolveBaseSetup: createBaseSetupResolver({
        headConfig,
        injectedAnalyzers: [probeAnalyzer()],
      }),
    });

    expect(identities(report.newFindings)).toEqual(['added-site']);
    expect(identities(report.unchangedFindings).sort()).toEqual(['a-site', 'legacy-site']);
  });
});
