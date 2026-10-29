import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { actionPinProblems } from './action-pins.mjs';

const repositoryRoot = path.join(import.meta.dirname, '..');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repository(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-action-pins-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

describe('repository action pins', () => {
  it('pins remote actions in all YAML files and Markdown YAML examples to full tags', () => {
    expect(actionPinProblems(repositoryRoot)).toEqual([]);
  });

  it.each(['java', 'kotlin'])('%s uses the MIT Gradle cache provider', (language) => {
    const workflow = parse(
      readFileSync(path.join(repositoryRoot, `.github/workflows/${language}-e2e.yml`), 'utf8'),
    );
    const step = workflow.jobs[`${language}-shard`].steps.find((entry) =>
      entry.uses?.startsWith('gradle/actions/setup-gradle@'),
    );

    expect(step.with['cache-provider']).toBe('basic');
  });
});

describe('action reference validation', () => {
  it.each([
    'actions/checkout',
    'actions/checkout@main',
    'actions/checkout@v7',
    'actions/checkout@v7.0',
  ])('rejects %s, including quoted values and inline mappings', (reference) => {
    const root = repository({
      '.github/workflows/test.yml': `jobs: { test: { steps: [{ uses: '${reference}' }] } }`,
    });

    expect(actionPinProblems(root)).toEqual([
      `.github/workflows/test.yml: pin ${reference} to a full version tag (vX.Y.Z)`,
    ]);
  });

  it('accepts full tags, action subpaths and local actions, without treating scripts as actions', () => {
    const root = repository({
      'action.yml': `runs:
  steps:
    - uses: "actions/checkout@v7.0.1" # full tag
    - uses: gradle/actions/setup-gradle@v6.4.0
    - uses: ./
    - uses: ./.github/actions/local
    - run: 'echo uses: actions/checkout@main'
`,
    });

    expect(actionPinProblems(root)).toEqual([]);
  });

  it('checks reusable workflows and nested composite actions in both YAML extensions', () => {
    const root = repository({
      '.github/workflows/test.yml':
        'jobs: { test: { uses: owner/repo/.github/workflows/test.yml@main } }',
      '.github/actions/example/action.yaml': 'runs: { steps: [{ uses: actions/setup-node@v7 }] }',
    });

    expect(actionPinProblems(root)).toEqual([
      '.github/actions/example/action.yaml: pin actions/setup-node@v7 to a full version tag (vX.Y.Z)',
      '.github/workflows/test.yml: pin owner/repo/.github/workflows/test.yml@main to a full version tag (vX.Y.Z)',
    ]);
  });

  it('checks every YAML fence in Markdown, including tilde fences, without parsing prose', () => {
    const root = repository({
      'docs/guide.md': [
        'The workflow uses: a full version.',
        '```yaml',
        '- uses: actions/checkout@v7',
        '```',
        '~~~yml',
        '- uses: actions/setup-node@main',
        '~~~',
        '```sh',
        'echo uses: a command',
        '```',
      ].join('\n'),
    });

    expect(actionPinProblems(root)).toEqual([
      'docs/guide.md: pin actions/checkout@v7 to a full version tag (vX.Y.Z)',
      'docs/guide.md: pin actions/setup-node@main to a full version tag (vX.Y.Z)',
    ]);
  });

  it('ignores installed dependencies, Git internals and generated reports', () => {
    const root = repository({
      'node_modules/dependency/action.yml': 'uses: actions/checkout@main',
      'packages/project/node_modules/dependency/action.yml': 'uses: actions/checkout@main',
      '.git/workflows/test.yaml': 'uses: actions/checkout@main',
      'reports/example.yaml': 'uses: actions/checkout@main',
    });

    expect(actionPinProblems(root)).toEqual([]);
  });

  it('visits shared and recursive YAML aliases once', () => {
    const root = repository({
      'action.yml': 'step: &step { uses: actions/checkout@main, again: *step }\ncopy: *step',
    });

    expect(actionPinProblems(root)).toEqual([
      'action.yml: pin actions/checkout@main to a full version tag (vX.Y.Z)',
    ]);
  });
});
