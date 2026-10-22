import { describe, expect, it } from 'vitest';
import { projectHeading, renderPlan, renderSummary } from './console.mjs';

const rows = [
  {
    project: { path: 'web', preset: 'typescript' },
    selection: { selected: true, reason: '2 changed files' },
  },
  {
    project: { path: 'svc', preset: 'java' },
    selection: { selected: false, reason: 'no changed files' },
  },
];

describe('renderPlan', () => {
  it('explains where a detected monorepo came from and how to choose the projects', () => {
    const plan = {
      source: 'detected',
      projects: [
        { origin: 'pnpm-workspace.yaml' },
        { origin: 'Gradle build' },
        { origin: 'Gradle build' },
      ],
    };

    expect(renderPlan({ plan, rows, outside: [] })).toBe(
      'Monorepo: 3 projects detected (pnpm-workspace.yaml, Gradle build). ' +
        'List them in "projects" of nitpicker.config.json to choose them; ' +
        '"projects": [] keeps this repository one project.\n' +
        '  run  web (typescript): 2 changed files\n' +
        '  skip svc (java): no changed files\n',
    );
  });

  it('says a listed monorepo was listed, and counts one project in the singular', () => {
    const plan = { source: 'declared', projects: [{ origin: 'x' }] };

    expect(renderPlan({ plan, rows: [], outside: [] })).toBe(
      'Monorepo: 1 project listed in "projects" of nitpicker.config.json.\n',
    );
  });

  it('names the changed files outside every project, a few at a time', () => {
    const plan = { source: 'declared', projects: [] };

    expect(renderPlan({ plan, rows: [], outside: ['a.md', 'b.md'] })).toBe(
      'Monorepo: 0 projects listed in "projects" of nitpicker.config.json.\n' +
        'Changed files outside every project, not checked: a.md, b.md\n',
    );
    expect(renderPlan({ plan, rows: [], outside: ['1', '2', '3', '4', '5', '6', '7'] })).toBe(
      'Monorepo: 0 projects listed in "projects" of nitpicker.config.json.\n' +
        'Changed files outside every project, not checked: 1, 2, 3, 4, 5 and 2 more\n',
    );
  });
});

describe('renderSummary', () => {
  const base = { preset: 'typescript', reason: 'r' };

  it('shows one line per project and the combined report', () => {
    const summary = {
      counts: { projects: 5, failed: 1, errored: 1, passed: 1, skipped: 2 },
      projects: [
        { ...base, path: 'a', status: 'failed', newEnforceableFindings: 1 },
        { ...base, path: 'b', status: 'failed', newEnforceableFindings: 3 },
        { ...base, path: 'c', status: 'error' },
        { ...base, path: 'd', status: 'error', error: 'boom' },
        { ...base, path: 'e', status: 'passed' },
        { ...base, path: 'f', status: 'skipped', reason: 'no changed files' },
      ],
    };

    expect(renderSummary({ summary, summaryPath: '/out/summary.json' })).toBe(
      '\nMonorepo summary: 1 failed, 1 incomplete, 1 passed, 2 skipped (5 projects)\n' +
        '  ✖ a (typescript): 1 new enforceable violation\n' +
        '  ✖ b (typescript): 3 new enforceable violations\n' +
        '  ! c (typescript): tool errors, the run is incomplete\n' +
        '  ! d (typescript): failed to run: boom\n' +
        '  ✓ e (typescript): no new violations\n' +
        '  - f (typescript): skipped (no changed files)\n' +
        'Combined report: /out/summary.json\n',
    );
  });

  it('shows the digests of several projects as one value for a person to accept', () => {
    const summary = {
      counts: { projects: 3, failed: 2, errored: 0, passed: 0, skipped: 1 },
      projects: [
        {
          ...base,
          path: 'a',
          status: 'failed',
          newEnforceableFindings: 1,
          policyDigest: 'aaaaaaaaaaaa',
        },
        {
          ...base,
          path: 'b',
          status: 'failed',
          newEnforceableFindings: 1,
          policyDigest: 'bbbbbbbbbbbb',
        },
        { ...base, path: 'c', status: 'skipped' },
      ],
    };

    expect(renderSummary({ summary, summaryPath: 'x' })).toBe(
      '\nMonorepo summary: 2 failed, 1 skipped (3 projects)\n' +
        '  ✖ a (typescript): 1 new enforceable violation\n' +
        '  ✖ b (typescript): 1 new enforceable violation\n' +
        '  - c (typescript): skipped (r)\n' +
        'Policy loosenings in 2 projects. A person who accepts them all sets ' +
        'NITPICKER_ACCEPT_POLICY_CHANGE=aaaaaaaaaaaa,bbbbbbbbbbbb in CI.\n' +
        'Combined report: x\n',
    );
  });

  it('leaves the acceptance to the project line when only one project loosened', () => {
    const summary = {
      counts: { projects: 1, failed: 1, errored: 0, passed: 0, skipped: 0 },
      projects: [
        {
          ...base,
          path: 'a',
          status: 'failed',
          newEnforceableFindings: 1,
          policyDigest: 'aaaaaaaaaaaa',
        },
      ],
    };

    expect(renderSummary({ summary, summaryPath: 'x' })).not.toContain('Policy loosenings in');
  });

  it('leaves out the counts that are zero', () => {
    const summary = {
      counts: { projects: 1, failed: 0, errored: 0, passed: 1, skipped: 0 },
      projects: [],
    };

    expect(renderSummary({ summary, summaryPath: 'x' })).toBe(
      '\nMonorepo summary: 1 passed (1 project)\nCombined report: x\n',
    );
  });
});

describe('projectHeading', () => {
  it('sets each project apart', () => {
    expect(projectHeading({ path: 'web', preset: 'typescript' })).toBe(
      '\n== web (typescript) ==\n',
    );
  });
});
