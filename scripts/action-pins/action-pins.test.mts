import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { actionPinProblems } from './action-pins.mts';
import { fieldsOf, listOf } from '../json/fields.mts';
import { temporaryRepositories } from '../test-support/temporary-repositories.mts';

const repositoryRoot = path.join(import.meta.dirname, '../..');
const repository = temporaryRepositories('nitpicker-action-pins-');

describe('repository action pins', () => {
  it('pins remote actions in all YAML files and Markdown YAML examples to full tags', () => {
    expect(actionPinProblems(repositoryRoot)).toEqual([]);
  });

  it.each(['java', 'kotlin'])('%s uses the MIT Gradle cache provider', (language) => {
    const workflow: unknown = parse(
      readFileSync(path.join(repositoryRoot, `.github/workflows/${language}-e2e.yml`), 'utf8'),
    );
    const job = fieldsOf(fieldsOf(fieldsOf(workflow)?.['jobs'])?.[`${language}-shard`]);
    const step = listOf(job?.['steps'])
      .map((entry) => fieldsOf(entry) ?? {})
      .find(
        ({ uses }) => typeof uses === 'string' && uses.startsWith('gradle/actions/setup-gradle@'),
      );

    expect(fieldsOf(step?.['with'])?.['cache-provider']).toBe('basic');
  });
});

describe('action reference validation', () => {
  it.each([
    'actions/checkout',
    'actions/checkout@main',
    'actions/checkout@v7',
    'actions/checkout@v7.0',
    'actions/checkout@0123456',
    'jhonDoe15/nitpicker@v0',
    'jhonDoe15/nitpicker@main',
    'other/nitpicker@v0.1',
  ])('rejects %s, including quoted values and inline mappings', (reference) => {
    const root = repository({
      '.github/workflows/test.yml': `jobs: { test: { steps: [{ uses: '${reference}' }] } }`,
    });

    expect(actionPinProblems(root)).toEqual([
      `.github/workflows/test.yml: pin ${reference} to a full version tag (vX.Y.Z)`,
    ]);
  });

  it('accepts full tags and SHAs, this action release line, subpaths and local actions, not scripts', () => {
    const root = repository({
      'action.yml': `runs:
  steps:
    - uses: "actions/checkout@v7.0.1" # full tag
    - uses: gradle/actions/setup-gradle@v6.4.0
    - uses: actions/setup-go@0123456789abcdef0123456789abcdef01234567
    - uses: jhonDoe15/nitpicker@v0.1
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

  it('ignores installed dependencies, Git internals, generated reports and init templates', () => {
    const root = repository({
      'node_modules/dependency/action.yml': 'uses: actions/checkout@main',
      'packages/project/node_modules/dependency/action.yml': 'uses: actions/checkout@main',
      '.git/workflows/test.yaml': 'uses: actions/checkout@main',
      'reports/example.yaml': 'uses: actions/checkout@main',
      'core/init/templates/workflow.yml': "uses: '{{ACTION}}'",
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
