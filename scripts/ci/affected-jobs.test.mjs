import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { matchesPaths, pushPaths, selectJobs, selectWorkflowJobs } from './affected-jobs.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const workflowsDirectory = path.join(root, '.github/workflows');
const workflows = readdirSync(workflowsDirectory)
  .filter((name) => name.endsWith('.yml'))
  .map((name) => {
    const text = readFileSync(path.join(workflowsDirectory, name), 'utf8');
    return { name, text, parsed: parse(text) };
  });
const selecting = workflows.filter(({ parsed }) => parsed.jobs.changes !== undefined);

const PATTERNS = ['core/**', 'languages/java/**', 'package.json', '.github/workflows/java-e2e.yml'];

function changes(...entries) {
  return { entries: entries.map((entry) => [entry].flat()), total: entries.length };
}

describe('pushPaths', () => {
  it('reads the paths of the push trigger and nothing else', () => {
    const text = [
      'name: demo',
      'on:',
      '  push:',
      '    branches: [main]',
      '    paths:',
      "      - 'core/**' # the CLI",
      '# a comment at column zero',
      '      - "shared/**"',
      '      - package.json',
      '  pull_request:',
      '    paths:',
      "      - 'docs/**'",
      'jobs: {}',
    ].join('\n');

    expect(pushPaths(text)).toEqual(['core/**', 'shared/**', 'package.json']);
  });

  it('returns no paths when the push trigger has none', () => {
    expect(pushPaths('on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n')).toEqual([]);
    expect(pushPaths('on:\n  workflow_dispatch:\n')).toEqual([]);
  });

  it.each(workflows.map(({ name }) => name))('agrees with the YAML parser on %s', (name) => {
    const { text, parsed } = workflows.find((workflow) => workflow.name === name);

    expect(pushPaths(text)).toEqual(parsed.on?.push?.paths ?? []);
  });
});

describe('matchesPaths', () => {
  it.each([
    ['core/cli.mjs', true],
    ['core/diff/git/patches.mjs', true],
    ['languages/java/adapters/java-runner.mjs', true],
    ['package.json', true],
    ['.github/workflows/java-e2e.yml', true],
    ['languages/javascript/index.mjs', false],
    ['languages/python/rules/rules.mjs', false],
    ['docs/usage.md', false],
    ['packages/package.json', false],
    ['.github/workflows/go-e2e.yml', false],
  ])('%s matches: %s', (file, expected) => {
    expect(matchesPaths(file, PATTERNS)).toBe(expected);
  });

  it('treats * as one path segment, ? as one character, **/ as any number of folders', () => {
    expect(matchesPaths('docs/a.md', ['docs/*.md'])).toBe(true);
    expect(matchesPaths('docs/deep/a.md', ['docs/*.md'])).toBe(false);
    expect(matchesPaths('a/b1.txt', ['a/b?.txt'])).toBe(true);
    expect(matchesPaths('src/pom.xml', ['**/pom.xml'])).toBe(true);
    expect(matchesPaths('pom.xml', ['**/pom.xml'])).toBe(true);
    expect(matchesPaths('a/x/y/b', ['a/**/b'])).toBe(true);
    expect(matchesPaths('a/b', ['a/**/b'])).toBe(true);
  });

  it('lets a later negated pattern exclude a file and a later pattern include it again', () => {
    expect(matchesPaths('core/a.md', ['core/**', '!core/*.md'])).toBe(false);
    expect(matchesPaths('core/a.md', ['core/**', '!core/*.md', 'core/a.md'])).toBe(true);
  });
});

describe('selectJobs', () => {
  it.each(['push', 'workflow_dispatch'])('runs everything on a %s run', (event) => {
    expect(selectJobs({ event, changes: undefined, patterns: PATTERNS }).run).toBe(true);
  });

  it('runs when a changed file is in the paths and names that file', () => {
    expect(
      selectJobs({
        event: 'pull_request',
        changes: changes('docs/usage.md', 'languages/java/adapters/java-runner.mjs'),
        patterns: PATTERNS,
      }),
    ).toEqual({
      run: true,
      reason: "languages/java/adapters/java-runner.mjs is in the workflow's paths",
    });
  });

  it('skips when no changed file is in the paths', () => {
    const selection = selectJobs({
      event: 'pull_request',
      changes: changes('docs/usage.md', 'languages/python/rules/rules.mjs'),
      patterns: PATTERNS,
    });

    expect(selection).toEqual({
      run: false,
      reason: "none of the 2 changed files is in the workflow's paths, so its jobs are skipped",
    });
  });

  it('runs when a renamed file moved out of the paths', () => {
    const renamed = changes(['docs/java-runner.mjs', 'languages/java/adapters/java-runner.mjs']);

    expect(selectJobs({ event: 'pull_request', changes: renamed, patterns: PATTERNS }).run).toBe(
      true,
    );
  });

  it('runs everything when the files cannot be listed, are listed only in part, or there are no paths', () => {
    const docs = changes('docs/usage.md');
    const partial = { entries: docs.entries, total: 3001 };
    const uncounted = { entries: docs.entries, total: undefined };

    expect(selectJobs({ event: 'pull_request', changes: undefined, patterns: PATTERNS }).run).toBe(
      true,
    );
    expect(selectJobs({ event: 'pull_request', changes: partial, patterns: PATTERNS }).run).toBe(
      true,
    );
    expect(selectJobs({ event: 'pull_request', changes: uncounted, patterns: PATTERNS }).run).toBe(
      true,
    );
    expect(selectJobs({ event: 'pull_request', changes: docs, patterns: [] }).run).toBe(true);
  });
});

describe('selectWorkflowJobs', () => {
  const workflow = '.github/workflows/java-e2e.yml';

  function actionsScript({ eventName, files, failure }) {
    const calls = [];
    const github = {
      rest: { pulls: { listFiles: 'listFiles' } },
      paginate: (method, options) => {
        calls.push(['paginate', method, options]);
        return failure === undefined ? Promise.resolve(files) : Promise.reject(new Error(failure));
      },
    };
    const context = {
      eventName,
      repo: { owner: 'owner', repo: 'repo' },
      payload: { pull_request: { number: 7, changed_files: files?.length ?? 0 } },
    };
    const core = {
      notice: (text) => calls.push(['notice', text]),
      warning: (text) => calls.push(['warning', text]),
      setOutput: (name, value) => calls.push(['setOutput', name, value]),
    };
    return { calls, script: { github, context, core, workflow: path.join(root, workflow) } };
  }

  const listing = [
    'paginate',
    'listFiles',
    { owner: 'owner', repo: 'repo', pull_number: 7, per_page: 100 },
  ];

  it('skips the jobs of a pull request that changes none of the paths', async () => {
    const { calls, script } = actionsScript({
      eventName: 'pull_request',
      files: [{ filename: 'docs/usage.md' }, { filename: 'languages/go/go.mjs' }],
    });

    expect(await selectWorkflowJobs(script)).toBe(false);
    expect(calls).toEqual([
      listing,
      [
        'notice',
        `${script.workflow}: none of the 2 changed files is in the workflow's paths, so its jobs are skipped.`,
      ],
      ['setOutput', 'run', 'false'],
    ]);
  });

  it('runs the jobs when a file moved out of the paths', async () => {
    const { calls, script } = actionsScript({
      eventName: 'pull_request',
      files: [{ filename: 'docs/old.mjs', previous_filename: 'languages/java/old.mjs' }],
    });

    expect(await selectWorkflowJobs(script)).toBe(true);
    expect(calls.at(-1)).toEqual(['setOutput', 'run', 'true']);
  });

  it('runs the jobs with a warning when the files cannot be listed', async () => {
    const { calls, script } = actionsScript({ eventName: 'pull_request', failure: 'rate limited' });

    expect(await selectWorkflowJobs(script)).toBe(true);
    expect(calls.slice(1)).toEqual([
      ['warning', "Listing the pull request's files failed: rate limited"],
      ['notice', `${script.workflow}: the changed files could not be listed, so everything runs.`],
      ['setOutput', 'run', 'true'],
    ]);
  });

  it('runs the jobs of a push without listing files', async () => {
    const { calls, script } = actionsScript({ eventName: 'push' });

    expect(await selectWorkflowJobs(script)).toBe(true);
    expect(calls).toEqual([
      ['notice', `${script.workflow}: a push run checks everything.`],
      ['setOutput', 'run', 'true'],
    ]);
  });
});

function selectionStep(name) {
  return [
    'const { selectWorkflowJobs } = await import(`${process.env.GITHUB_WORKSPACE}/scripts/ci/affected-jobs.mjs`);',
    `await selectWorkflowJobs({ github, context, core, workflow: '.github/workflows/${name}' });`,
    '',
  ].join('\n');
}

function ungatedJobs(parsed) {
  return Object.entries(parsed.jobs)
    .filter(([job]) => job !== 'changes')
    .filter(
      ([, definition]) =>
        ![definition.needs].flat().includes('changes') ||
        (!String(definition.if).includes('always()') &&
          definition.if !== "needs.changes.outputs.run == 'true'"),
    )
    .map(([job]) => job);
}

describe('workflows that select their jobs from the changed files', () => {
  it('are every workflow that runs on the run-ci label except the typescript one', () => {
    const labeled = workflows
      .filter(({ parsed }) => parsed.on?.pull_request?.types?.includes('labeled'))
      .map(({ name }) => name);

    expect(selecting.map(({ name }) => name)).toEqual(
      labeled.filter((name) => name !== 'typescript.yml'),
    );
  });

  it.each(selecting.map(({ name }) => name))(
    '%s: lists its own file and the selection in its paths and selects with its own paths',
    (name) => {
      const { parsed } = selecting.find((workflow) => workflow.name === name);
      const own = ['scripts/ci/**', `.github/workflows/${name}`];

      expect(parsed.on.push.paths.filter((pattern) => own.includes(pattern))).toEqual(own);
      expect(parsed.jobs.changes.steps.at(-1).with.script).toBe(selectionStep(name));
    },
  );

  it.each(selecting.map(({ name }) => name))('%s: gates every job on the selection', (name) => {
    const { parsed } = selecting.find((workflow) => workflow.name === name);

    expect(ungatedJobs(parsed)).toEqual([]);
  });

  it.each(selecting.map(({ name }) => name))(
    '%s: selects on the run-ci label with read-only access to the pull request',
    (name) => {
      const { changes } = selecting.find((workflow) => workflow.name === name).parsed.jobs;

      expect([changes.if, changes.permissions, changes.steps[0].with]).toEqual([
        "github.event_name != 'pull_request' || github.event.label.name == 'run-ci'",
        { contents: 'read', 'pull-requests': 'read' },
        { 'sparse-checkout': '.github/workflows\nscripts/ci\n' },
      ]);
    },
  );
});
