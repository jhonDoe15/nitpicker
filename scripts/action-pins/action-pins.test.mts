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

  const expression = (text: string) => ['$', '{{ ', text, ' }}'].join('');
  const onPullRequestOnly = expression("github.event_name != 'pull_request'");
  const gradleCaches = [
    {
      workflow: 'java-e2e',
      job: 'java-shard',
      prefix: 'java-gradle-v2',
      setupCache: onPullRequestOnly,
    },
    {
      workflow: 'kotlin-e2e',
      job: 'kotlin-shard',
      prefix: 'kotlin-gradle-v2',
      setupCache: onPullRequestOnly,
    },
    { workflow: 'python-e2e', job: 'python-shard', prefix: 'python-gradle', setupCache: true },
    { workflow: 'platforms', job: 'samples', prefix: 'platforms-gradle', setupCache: true },
  ];
  const stepsOf = (workflowName: string, jobName: string) => {
    const workflow: unknown = parse(
      readFileSync(path.join(repositoryRoot, `.github/workflows/${workflowName}.yml`), 'utf8'),
    );
    return listOf(fieldsOf(fieldsOf(fieldsOf(workflow)?.['jobs'])?.[jobName])?.['steps']).map(
      (entry) => fieldsOf(entry) ?? {},
    );
  };

  it.each(gradleCaches)('$workflow uses the MIT Gradle cache provider', ({ workflow, job }) => {
    const step = stepsOf(workflow, job).find(
      ({ uses }) => typeof uses === 'string' && uses.startsWith('gradle/actions/setup-gradle@'),
    );

    expect(fieldsOf(step?.['with'])?.['cache-provider']).toBe('basic');
  });

  it.each(gradleCaches)(
    '$workflow restores the Gradle dependency cache and saves it from a green run on main',
    ({ workflow, job, prefix: keyPrefix, setupCache }) => {
      const steps = stepsOf(workflow, job);
      const pathOf = (inputs: unknown) => {
        const text = fieldsOf(inputs)?.['path'];
        return typeof text === 'string' ? text : '';
      };
      const stepUsing = (prefix: string, pathText = '') =>
        steps.find(
          ({ uses, with: inputs }) =>
            typeof uses === 'string' &&
            uses.startsWith(prefix) &&
            pathOf(inputs).includes(pathText),
        );
      const restore = fieldsOf(stepUsing('actions/cache/restore@', 'modules-2')?.['with']);
      const save = stepUsing('actions/cache/save@', 'modules-2');

      const shard = job === 'samples' ? '' : `${expression('matrix.shard')}-`;
      const prefix = `${keyPrefix}-${expression('runner.os')}-${shard}`;
      const hash = expression("hashFiles('**/*.gradle*', '**/gradle-wrapper.properties')");
      const onMain = [
        'success()',
        "github.ref == 'refs/heads/main'",
        "github.event_name != 'pull_request'",
        "steps.gradle-cache.outputs.cache-hit != 'true'",
      ].join(' && ');

      expect(restore).toEqual({
        path: '~/.gradle/caches/modules-2\n~/.gradle/caches/jars-*\n',
        key: `${prefix}${hash}`,
        'restore-keys': `${prefix}\n`,
      });
      expect(save?.['if']).toBe(expression(onMain));
      expect(fieldsOf(stepUsing('actions/cache/save@', 'modules-2')?.['with'])?.['key']).toBe(
        `${prefix}${hash}`,
      );
      expect(
        fieldsOf(stepUsing('gradle/actions/setup-gradle@')?.['with'])?.['cache-disabled'],
      ).toBe(setupCache);
      expect(fieldsOf(stepUsing('actions/setup-java@')?.['with'])?.['cache']).toBe(
        workflow === 'platforms' ? 'maven' : undefined,
      );
    },
  );
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
