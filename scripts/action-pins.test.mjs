import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const repositoryRoot = path.join(import.meta.dirname, '..');
const fullVersionTag = /^[\w.-]+\/[\w./-]+@v\d+\.\d+\.\d+$/u;
const yamlFence =
  /^ {0,3}(`{3,}|~{3,})(?:yaml|yml)[^\S\r\n]*\r?\n([\s\S]*?)^ {0,3}\1[^\S\r\n]*$/gmu;

function references(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'uses' ? [child] : references(child),
  );
}

function unpinnedActions(text) {
  return references(parse(text)).filter(
    (reference) =>
      typeof reference !== 'string' ||
      (!reference.startsWith('./') && !fullVersionTag.test(reference)),
  );
}

function yamlDocuments(file, text) {
  return file.endsWith('.md') ? [...text.matchAll(yamlFence)].map((match) => match[2]) : [text];
}

const files = [
  ...new Set(
    globSync(['**/*.{yml,yaml,md}', '.github/**/*.{yml,yaml,md}'], {
      cwd: repositoryRoot,
      exclude: ['**/node_modules/**', '.git/**', 'reports/**'],
    }),
  ),
].sort();

describe('repository action pins', () => {
  it.each(files)('%s pins remote actions to full version tags', (file) => {
    const text = readFileSync(path.join(repositoryRoot, file), 'utf8');

    expect(yamlDocuments(file, text).flatMap(unpinnedActions)).toEqual([]);
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
    expect(unpinnedActions(`jobs: { test: { steps: [{ uses: '${reference}' }] } }`)).toEqual([
      reference,
    ]);
  });

  it('accepts full tags, action subpaths and local actions, without treating scripts as actions', () => {
    expect(
      unpinnedActions(`runs:
  steps:
    - uses: "actions/checkout@v7.0.1" # full tag
    - uses: gradle/actions/setup-gradle@v6.4.0
    - uses: ./
    - uses: ./.github/actions/local
    - run: 'echo uses: actions/checkout@main'
`),
    ).toEqual([]);
  });

  it('also checks reusable workflow references', () => {
    expect(
      unpinnedActions('jobs: { test: { uses: owner/repo/.github/workflows/test.yml@main } }'),
    ).toEqual(['owner/repo/.github/workflows/test.yml@main']);
  });

  it('checks every YAML fence in Markdown, including tilde fences, without parsing prose', () => {
    const markdown = [
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
    ].join('\n');

    expect(yamlDocuments('guide.md', markdown).flatMap(unpinnedActions)).toEqual([
      'actions/checkout@v7',
      'actions/setup-node@main',
    ]);
  });
});
