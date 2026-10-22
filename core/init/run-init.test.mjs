import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../cli.mjs';
import { INIT_USAGE_TEXT } from '../help/usage-text.mjs';
import { readSnippet } from './files/agents-md.mjs';
import { unifiedDiff } from './files/line-diff.mjs';
import { captureOutput, readText, useProjects } from './test-support/projects.mjs';

const project = useProjects();
const TYPESCRIPT = { 'package.json': '{}', 'src/index.ts': 'export const value = 1;\n' };
const SKILL = 'npx skills add jhonDoe15/nitpicker --skill';
const NODE_INSTALL = 'nitpicker typescript @types/node vitest @vitest/coverage-v8';
const NODE_MISSING = 'nitpicker, typescript, @types/node, vitest, @vitest/coverage-v8';
const GRADLE_NOTE =
  'There is no gradlew, so nitpicker runs gradle from the PATH. Install it, or add the wrapper.';
const MAVEN_NOTE =
  'There is no mvnw, so nitpicker runs mvn from the PATH. Install it, or add the wrapper.';
const JVM_NEEDS = 'Needs Java 21 or newer. nitpicker adds its own analysis tools to the build.';
const PYTHON_MISSING = 'coverage, mypy, pytest, mutmut>=3,<4';
const PYTHON_ARGUMENTS = "coverage mypy pytest 'mutmut>=3,<4'";
const WORKFLOW_PATH = '.github/workflows/nitpicker.yml';
const YARN_WORKFLOW = [
  'name: nitpicker',
  '',
  'on:',
  '  pull_request:',
  '',
  'permissions:',
  '  contents: read',
  '',
  'jobs:',
  '  nitpicker:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '        with:',
  '          fetch-depth: 0',
  '      - uses: actions/setup-node@v4',
  '        with:',
  '          node-version: 24',
  '      - run: yarn install --frozen-lockfile',
  '      - name: nitpicker',
  '        run: yarn nitpicker',
  '',
].join('\n');

function expectedReport({ head, peers, skills, offers, command = 'npx nitpicker' }) {
  const defaultOffers = [
    `To add the agent guidance to AGENTS.md, run: ${command} init --agents-md`,
    `To write ${WORKFLOW_PATH}, run: ${command} init --ci github`,
  ];
  return [
    ...head,
    '',
    ...peers,
    '',
    'Teach your coding agent the allowed forms:',
    ...skills.map((skill) => `  ${SKILL} ${skill}`),
    '',
    ...(offers ?? defaultOffers),
    '',
    `Then run \`${command}\` to check a change, or \`${command} --all\` to survey the whole project.`,
    '',
  ].join('\n');
}

function install(missing, command) {
  return [`Install what nitpicker needs from your project (missing: ${missing}):`, `  ${command}`];
}

function npmReport({ headline, headLine, offers }) {
  return expectedReport({
    head: [headline, headLine],
    peers: install(NODE_MISSING, `npm install --save-dev ${NODE_INSTALL}`),
    skills: ['nitpicker-typescript'],
    offers,
  });
}

function init(root, ...initArguments) {
  const { output, stdout, stderr } = captureOutput();
  const exitCode = runCli({
    arguments_: ['init', ...initArguments],
    currentProjectRoot: root,
    stdout,
    stderr,
  });
  return { exitCode, ...output };
}

describe('nitpicker init', () => {
  it('writes the config and reports the setup of a TypeScript project', () => {
    const root = project({
      ...TYPESCRIPT,
      'package.json': '{"devDependencies":{"typescript":"6"}}',
      'pnpm-lock.yaml': '',
    });

    expect(init(root)).toEqual({
      exitCode: 0,
      stderrText: '',
      stdoutText: expectedReport({
        head: [
          'nitpicker init: TypeScript, pnpm, Vitest (preset "typescript")',
          'created nitpicker.config.json',
        ],
        peers: install(
          'nitpicker, @types/node, vitest, @vitest/coverage-v8',
          'pnpm add --save-dev nitpicker @types/node vitest @vitest/coverage-v8',
        ),
        skills: ['nitpicker-typescript'],
        command: 'pnpm exec nitpicker',
      }),
    });
    expect(readText(root, 'nitpicker.config.json')).toBe('{ "preset": "typescript" }\n');
  });

  it('says there is nothing to install when the peers are there', () => {
    const deps = { nitpicker: '1', typescript: '6', '@types/node': '25', jest: '30' };
    const root = project({
      ...TYPESCRIPT,
      'package.json': JSON.stringify({ scripts: { test: 'jest' }, devDependencies: deps }),
    });

    expect(init(root).stdoutText).toBe(
      expectedReport({
        head: [
          'nitpicker init: TypeScript, npm, Jest (preset "typescript")',
          'created nitpicker.config.json',
        ],
        peers: ['Nothing to install: every peer nitpicker needs is already there.'],
        skills: ['nitpicker-typescript'],
      }),
    );
  });

  it.each([
    [
      'a JavaScript project',
      { 'src/index.js': '' },
      {
        head: ['nitpicker init: JavaScript, npm, Vitest (preset "javascript")'],
        peers: install(NODE_MISSING, `npm install --save-dev ${NODE_INSTALL}`),
        skills: ['nitpicker-javascript'],
      },
      'javascript',
    ],
    [
      'a Python project',
      { 'pyproject.toml': '', 'app.py': '' },
      {
        head: ['nitpicker init: Python, path, unittest, mypy, ruff (preset "python")'],
        peers: install(PYTHON_MISSING, `python -m pip install ${PYTHON_ARGUMENTS}`),
        skills: ['nitpicker-python'],
      },
      'python',
    ],
    [
      'a uv project',
      { 'pyproject.toml': '[tool.uv]\n', 'uv.lock': '' },
      {
        head: ['nitpicker init: Python, uv, unittest, mypy, ruff (preset "python")'],
        peers: install(PYTHON_MISSING, `uv add --dev ${PYTHON_ARGUMENTS}`),
        skills: ['nitpicker-python'],
      },
      'python',
    ],
    [
      'a Gradle project',
      { 'build.gradle': '', 'src/main/java/App.java': 'class App {}' },
      {
        head: ['nitpicker init: Java, Gradle (preset "java")'],
        notes: [GRADLE_NOTE],
        peers: [JVM_NEEDS],
        skills: ['nitpicker-java'],
      },
      'java',
    ],
    [
      'a Maven project',
      { 'pom.xml': '', 'src/main/java/App.java': 'class App {}' },
      {
        head: ['nitpicker init: Java, Maven (preset "java")'],
        notes: [MAVEN_NOTE],
        peers: [JVM_NEEDS],
        skills: ['nitpicker-java'],
      },
      'java',
    ],
    [
      'a Kotlin project',
      { 'build.gradle.kts': '', gradlew: '', 'src/main/kotlin/App.kt': '' },
      {
        head: ['nitpicker init: Kotlin, Gradle (preset "kotlin")'],
        peers: [JVM_NEEDS],
        skills: ['nitpicker-kotlin'],
      },
      'kotlin',
    ],
    [
      'a Kotlin project with Java sources',
      {
        'build.gradle.kts': '',
        gradlew: '',
        'src/main/kotlin/A.kt': '',
        'src/main/kotlin/B.kt': '',
        'src/main/java/C.java': '',
      },
      {
        head: ['nitpicker init: Kotlin, Gradle (preset "kotlin")'],
        peers: [JVM_NEEDS],
        skills: ['nitpicker-kotlin', 'nitpicker-java'],
      },
      'kotlin',
    ],
  ])('sets up %s', (_name, files, report, preset) => {
    const root = project(files);
    const { head, notes = [], ...rest } = report;
    const created = [...head, 'created nitpicker.config.json', ...notes];

    expect(init(root)).toEqual({
      exitCode: 0,
      stderrText: '',
      stdoutText: expectedReport({ ...rest, head: created }),
    });
    expect(readText(root, 'nitpicker.config.json')).toBe(`{ "preset": "${preset}" }\n`);
  });

  it('stops with advice when the folder holds no project', () => {
    const root = project({});

    expect(init(root)).toEqual({
      exitCode: 2,
      stdoutText: '',
      stderrText:
        `nitpicker failed: Nothing to detect in ${root}: no package.json, pom.xml, build.gradle, ` +
        "pyproject.toml or other project file. Run nitpicker init in the project's directory.\n",
    });
  });
});

describe('nitpicker init with an existing config', () => {
  it('exits 0 and changes nothing when the config already sets the detected preset', () => {
    const text = '{\n  "preset": "typescript",\n  "disable": ["mutation"]\n}\n';
    const root = project({ ...TYPESCRIPT, 'nitpicker.config.json': text });

    expect(init(root)).toEqual({
      exitCode: 0,
      stderrText: '',
      stdoutText: npmReport({
        headline: 'nitpicker init: TypeScript, npm, Vitest (preset "typescript")',
        headLine: 'nitpicker.config.json is already set up',
      }),
    });
    expect(readText(root, 'nitpicker.config.json')).toBe(text);
  });

  it('exits 1 with the diff and how to apply it when the config differs', () => {
    const text = '{ "preset": "typescript" }\n';
    const root = project({ 'src/index.js': '', 'nitpicker.config.json': text });

    expect(init(root)).toEqual({
      exitCode: 1,
      stderrText: '',
      stdoutText: expectedReport({
        head: [
          'nitpicker init: JavaScript, npm, Vitest (preset "javascript")',
          'nitpicker.config.json exists and was not changed. It does not set "preset": "javascript", which this project needs. The diff from your file to what init would write:',
          '',
          '--- nitpicker.config.json',
          '+++ nitpicker.config.json (nitpicker init)',
          '@@ -1,1 +1,1 @@',
          '-{ "preset": "typescript" }',
          '+{ "preset": "javascript" }',
          '',
          'Apply the change by hand, or move nitpicker.config.json aside and run nitpicker init again.',
        ],
        peers: install(NODE_MISSING, `npm install --save-dev ${NODE_INSTALL}`),
        skills: ['nitpicker-javascript'],
      }),
    });
    expect(readText(root, 'nitpicker.config.json')).toBe(text);
  });

  it('still does the rest of the setup when the config differs', () => {
    const root = project({ ...TYPESCRIPT, 'nitpicker.config.json': '{}\n' });
    const result = init(root, '--agents-md');

    expect(result.exitCode).toBe(1);
    expect(readText(root, 'AGENTS.md')).toBe(`${readSnippet()}\n`);
  });
});

describe('nitpicker init --agents-md', () => {
  const HEADLINE = 'nitpicker init: TypeScript, npm, Vitest (preset "typescript")';
  const ciOffer = `To write ${WORKFLOW_PATH}, run: npx nitpicker init --ci github`;

  it('appends the snippet once', () => {
    const root = project({ ...TYPESCRIPT, 'AGENTS.md': '# Project\n' });
    const first = init(root, '--agents-md');
    const afterFirst = readText(root, 'AGENTS.md');
    const second = init(root, '--agents-md');

    expect(first.stdoutText).toBe(
      npmReport({
        headline: HEADLINE,
        headLine: 'created nitpicker.config.json',
        offers: ['appended the nitpicker section to AGENTS.md', ciOffer],
      }),
    );
    expect(afterFirst).toBe(`# Project\n\n${readSnippet()}\n`);
    expect(second.stdoutText).toBe(
      npmReport({
        headline: HEADLINE,
        headLine: 'nitpicker.config.json is already set up',
        offers: ['AGENTS.md already has the nitpicker section', ciOffer],
      }),
    );
    expect(readText(root, 'AGENTS.md')).toBe(afterFirst);
  });

  it('creates AGENTS.md when there is none', () => {
    const root = project(TYPESCRIPT);

    expect(init(root, '--agents-md').stdoutText).toBe(
      npmReport({
        headline: HEADLINE,
        headLine: 'created nitpicker.config.json',
        offers: ['created AGENTS.md with the nitpicker section', ciOffer],
      }),
    );
  });

  it('only offers the snippet without the flag', () => {
    const root = project(TYPESCRIPT);
    init(root);

    expect(existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
  });
});

describe('nitpicker init --ci github', () => {
  const yarnReport = (workflowLines, headLine = 'created nitpicker.config.json') =>
    expectedReport({
      head: ['nitpicker init: TypeScript, yarn, Vitest (preset "typescript")', headLine],
      peers: install(NODE_MISSING, `yarn add --dev ${NODE_INSTALL}`),
      skills: ['nitpicker-typescript'],
      offers: [
        'To add the agent guidance to AGENTS.md, run: yarn nitpicker init --agents-md',
        ...workflowLines,
      ],
      command: 'yarn nitpicker',
    });

  it('writes the workflow for the package manager of the project', () => {
    const root = project({ ...TYPESCRIPT, 'yarn.lock': '' }, { repository: true });

    expect(init(root, '--ci', 'github')).toEqual({
      exitCode: 0,
      stderrText: '',
      stdoutText: yarnReport([`created ${WORKFLOW_PATH}`]),
    });
    expect(readText(root, WORKFLOW_PATH)).toBe(YARN_WORKFLOW);
  });

  it('exits 1 with the diff and leaves an existing workflow alone', () => {
    const existing = 'name: nitpicker\non: push\n';
    const root = project(
      { ...TYPESCRIPT, 'yarn.lock': '', [WORKFLOW_PATH]: existing },
      { repository: true },
    );
    const diff = unifiedDiff({ name: WORKFLOW_PATH, before: existing, after: YARN_WORKFLOW });

    expect(init(root, '--ci', 'github')).toEqual({
      exitCode: 1,
      stderrText: '',
      stdoutText: yarnReport([
        `${WORKFLOW_PATH} exists and was not changed. It differs from what init would write. The diff from your file to what init would write:`,
        '',
        ...diff.trimEnd().split('\n'),
        '',
        `Apply the change by hand, or move ${WORKFLOW_PATH} aside and run nitpicker init again.`,
      ]),
    });
    expect(readText(root, WORKFLOW_PATH)).toBe(existing);
  });

  it('exits 0 when the workflow is already what init would write', () => {
    const root = project({ ...TYPESCRIPT, 'yarn.lock': '' }, { repository: true });
    init(root, '--ci', 'github');

    expect(init(root, '--ci', 'github')).toEqual({
      exitCode: 0,
      stderrText: '',
      stdoutText: yarnReport(
        [`${WORKFLOW_PATH} is already set up`],
        'nitpicker.config.json is already set up',
      ),
    });
  });

  it.each([['gitlab'], []])('rejects the provider %j, which it cannot write', (...provider) => {
    expect(init(project(TYPESCRIPT), '--ci', ...provider)).toEqual({
      exitCode: 2,
      stdoutText: '',
      stderrText: 'nitpicker failed: --ci takes one of: github\n',
    });
  });
});

describe('nitpicker init arguments', () => {
  it('prints its own help', () => {
    expect(init(project({}), '--help')).toEqual({
      exitCode: 0,
      stdoutText: INIT_USAGE_TEXT,
      stderrText: '',
    });
  });

  it('refuses an unknown argument and says where to look', () => {
    expect(init(project(TYPESCRIPT), '--force')).toEqual({
      exitCode: 2,
      stdoutText: '',
      stderrText:
        'nitpicker failed: Unknown argument for init: --force. See nitpicker init --help.\n',
    });
  });
});
