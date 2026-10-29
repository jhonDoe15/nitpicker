import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageVersion } from '../help/package-version.mjs';
import { INIT_USAGE_TEXT } from '../help/usage-text.mjs';
import { readSnippet } from './files/agents-md.mjs';
import { unifiedDiff } from './files/line-diff.mjs';
import { init, initWith, readText, useProjects } from './test-support/projects.mjs';

const createProject = useProjects();
const TYPESCRIPT = { 'package.json': '{}', 'src/index.ts': 'export const value = 1;\n' };
const SKILL = 'npx skills add jhonDoe15/nitpicker --skill';
const NITPICKER = `nitpicker@${packageVersion()}`;
const NODE_INSTALL = `${NITPICKER} typescript @types/node vitest @vitest/coverage-v8`;
const NODE_MISSING = `${NITPICKER}, typescript, @types/node, vitest, @vitest/coverage-v8`;
const GRADLE_NOTE =
  'There is no gradlew, so nitpicker runs gradle from the PATH. Install it, or add the wrapper.';
const MAVEN_NOTE =
  'There is no mvnw, so nitpicker runs mvn from the PATH. Install it, or add the wrapper.';
const JVM_NEEDS = 'Needs Java 21 or newer. nitpicker adds its own analysis tools to the build.';
const PYTHON_MISSING = 'coverage, mypy, pytest, mutmut>=3,<4';
const PYTHON_ARGUMENTS = "coverage mypy pytest 'mutmut>=3,<4'";
const WORKFLOW_PATH = '.github/workflows/nitpicker.yml';
const CREATED = ['created nitpicker.config.json'];
const SET_UP = ['nitpicker.config.json is already set up'];
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

function project(files) {
  return createProject(files, { repository: true });
}

function expectedReport({
  head,
  peers,
  config = CREATED,
  skills,
  offers,
  command = 'npx nitpicker',
}) {
  const defaultOffers = [
    `To add the agent guidance to AGENTS.md, run: ${command} init --agents-md`,
    `To write ${WORKFLOW_PATH}, run: ${command} init --ci github`,
  ];
  return [
    ...head,
    '',
    ...peers,
    '',
    ...config,
    '',
    'Install the agent skill:',
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

function npmReport({ config, offers }) {
  return expectedReport({
    head: ['nitpicker init: TypeScript, npm, Vitest (preset "typescript")'],
    peers: install(NODE_MISSING, `npm install --save-dev ${NODE_INSTALL}`),
    config,
    skills: ['nitpicker-typescript'],
    offers,
  });
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
        head: ['nitpicker init: TypeScript, pnpm, Vitest (preset "typescript")'],
        peers: install(
          `${NITPICKER}, @types/node, vitest, @vitest/coverage-v8`,
          `pnpm add --save-dev ${NITPICKER} @types/node vitest @vitest/coverage-v8`,
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
        head: ['nitpicker init: TypeScript, npm, Jest (preset "typescript")'],
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
        head: ['nitpicker init: Python, pip, unittest, mypy, ruff (preset "python")'],
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
        head: ['nitpicker init: Java, Gradle (preset "java")', GRADLE_NOTE],
        peers: [JVM_NEEDS],
        skills: ['nitpicker-java'],
      },
      'java',
    ],
    [
      'a Maven project',
      { 'pom.xml': '', 'src/main/java/App.java': 'class App {}' },
      {
        head: ['nitpicker init: Java, Maven (preset "java")', MAVEN_NOTE],
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

    expect(init(root)).toEqual({
      exitCode: 0,
      stderrText: '',
      stdoutText: expectedReport(report),
    });
    expect(readText(root, 'nitpicker.config.json')).toBe(`{ "preset": "${preset}" }\n`);
  });

  it('suggests declaring a peer that only the local .venv holds', () => {
    const root = project({
      'requirements.txt': 'coverage\nmypy\npytest\n',
      '.venv/lib/python3.13/site-packages/mutmut/__init__.py': '',
    });

    expect(init(root).stdoutText).toBe(
      expectedReport({
        head: ['nitpicker init: Python, pip, pytest, mypy, ruff (preset "python")'],
        peers: [
          'Nothing to install: every peer nitpicker needs is already there.',
          'Installed in .venv but not declared: mutmut>=3,<4. Declare them as development dependencies, so a fresh checkout gets them too; the CI workflow of init installs them itself.',
        ],
        skills: ['nitpicker-python'],
      }),
    );
  });
});

describe('nitpicker init stops before it writes', () => {
  it('when the folder holds no project', () => {
    const root = project({});

    expect(init(root)).toEqual({
      exitCode: 2,
      stdoutText: '',
      stderrText:
        `nitpicker failed: Nothing to detect in ${root}: no package.json, pom.xml, build.gradle, ` +
        "pyproject.toml or other project file. Run nitpicker init in the project's directory.\n",
    });
  });

  it('when the folder is not in a Git repository', () => {
    const root = createProject(TYPESCRIPT);

    expect(init(root)).toEqual({
      exitCode: 2,
      stdoutText: '',
      stderrText: `nitpicker failed: ${root} is not in a Git repository. nitpicker compares your changes with their merge base, so it needs one: run git init in the project folder or one above it, and run nitpicker init again.\n`,
    });
    expect(existsSync(path.join(root, 'nitpicker.config.json'))).toBe(false);
  });

  it('when Node.js is older than the engines field of nitpicker allows', () => {
    const root = project(TYPESCRIPT);

    expect(initWith({ currentProjectRoot: root, nodeVersion: '22.13.1' }).exitCode).toBe(2);
    expect(existsSync(path.join(root, 'nitpicker.config.json'))).toBe(false);
  });

  it('when a Maven project has only Kotlin sources', () => {
    const root = project({ 'pom.xml': '', mvnw: '', 'src/main/kotlin/App.kt': '' });

    expect(init(root).stderrText).toBe(
      'nitpicker failed: This Maven project has Kotlin sources and no Java ones, and the kotlin preset needs a Gradle build today, so nitpicker cannot check it yet. Build it with Gradle to use the kotlin preset.\n',
    );
  });
});

describe('nitpicker init with an existing config', () => {
  it('exits 0 and changes nothing when the config already sets the detected preset', () => {
    const text = '{\n  "preset": "typescript",\n  "disable": ["mutation"]\n}\n';
    const root = project({ ...TYPESCRIPT, 'nitpicker.config.json': text });

    expect(init(root)).toEqual({
      exitCode: 0,
      stderrText: '',
      stdoutText: npmReport({ config: SET_UP }),
    });
    expect(readText(root, 'nitpicker.config.json')).toBe(text);
  });

  it('exits 0 for a TypeScript project whose config sets no preset, the default one', () => {
    const root = project({
      ...TYPESCRIPT,
      'nitpicker.config.json': '{ "disable": ["mutation"] }\n',
    });

    expect(init(root)).toEqual({
      exitCode: 0,
      stderrText: '',
      stdoutText: npmReport({ config: SET_UP }),
    });
  });

  it('exits 1 with the diff that adds the preset to a config without one', () => {
    const text = '{\n  "disable": ["mutation"]\n}\n';
    const root = project({ 'src/index.js': '', 'nitpicker.config.json': text });

    expect(init(root)).toEqual({
      exitCode: 1,
      stderrText: '',
      stdoutText: expectedReport({
        head: ['nitpicker init: JavaScript, npm, Vitest (preset "javascript")'],
        peers: install(NODE_MISSING, `npm install --save-dev ${NODE_INSTALL}`),
        config: [
          'nitpicker.config.json exists and was not changed. It sets no preset: add "preset": "javascript". The diff from your file to what init would write:',
          '',
          '--- nitpicker.config.json',
          '+++ nitpicker.config.json (nitpicker init)',
          '@@ -1,3 +1,4 @@',
          ' {',
          '+  "preset": "javascript",',
          '   "disable": ["mutation"]',
          ' }',
          '',
          'Apply the change by hand, or move nitpicker.config.json aside and run nitpicker init again.',
        ],
        skills: ['nitpicker-javascript'],
      }),
    });
    expect(readText(root, 'nitpicker.config.json')).toBe(text);
  });

  it('still does the rest of the setup when the config differs', () => {
    const root = project({ ...TYPESCRIPT, 'nitpicker.config.json': '{ "preset": "java" }\n' });
    const result = init(root, '--agents-md');

    expect(result.exitCode).toBe(1);
    expect(readText(root, 'AGENTS.md')).toBe(`${readSnippet()}\n`);
  });
});

describe('nitpicker init --agents-md', () => {
  const ciOffer = `To write ${WORKFLOW_PATH}, run: npx nitpicker init --ci github`;

  it('appends the snippet once', () => {
    const root = project({ ...TYPESCRIPT, 'AGENTS.md': '# Project\n' });
    const first = init(root, '--agents-md');
    const afterFirst = readText(root, 'AGENTS.md');
    const second = init(root, '--agents-md');

    expect(first.stdoutText).toBe(
      npmReport({ offers: ['appended the nitpicker section to AGENTS.md', ciOffer] }),
    );
    expect(afterFirst).toBe(`# Project\n\n${readSnippet()}\n`);
    expect(second.stdoutText).toBe(
      npmReport({
        config: SET_UP,
        offers: ['AGENTS.md already has the nitpicker section', ciOffer],
      }),
    );
    expect(readText(root, 'AGENTS.md')).toBe(afterFirst);
  });

  it('creates AGENTS.md when there is none', () => {
    const root = project(TYPESCRIPT);

    expect(init(root, '--agents-md').stdoutText).toBe(
      npmReport({ offers: ['created AGENTS.md with the nitpicker section', ciOffer] }),
    );
  });

  it('only offers the snippet without the flag', () => {
    const root = project(TYPESCRIPT);
    init(root);

    expect(existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
  });
});

describe('nitpicker init --ci github', () => {
  const yarnReport = (workflowLines, config = CREATED) =>
    expectedReport({
      head: ['nitpicker init: TypeScript, yarn, Vitest (preset "typescript")'],
      peers: install(NODE_MISSING, `yarn add --dev ${NODE_INSTALL}`),
      config,
      skills: ['nitpicker-typescript'],
      offers: [
        'To add the agent guidance to AGENTS.md, run: yarn nitpicker init --agents-md',
        ...workflowLines,
      ],
      command: 'yarn nitpicker',
    });

  it('writes the workflow for the package manager of the project', () => {
    const root = project({ ...TYPESCRIPT, 'yarn.lock': '' });

    expect(init(root, '--ci', 'github')).toEqual({
      exitCode: 0,
      stderrText: '',
      stdoutText: yarnReport([`created ${WORKFLOW_PATH}`]),
    });
    expect(readText(root, WORKFLOW_PATH)).toBe(YARN_WORKFLOW);
  });

  it('names the workflow of a project in a subfolder after its path', () => {
    const root = project({ 'apps/web/package.json': '{}', 'apps/web/src/a.ts': '' });
    const result = init(path.join(root, 'apps/web'), '--ci', 'github');

    expect(result.stdoutText).toBe(
      npmReport({
        offers: [
          'To add the agent guidance to AGENTS.md, run: npx nitpicker init --agents-md',
          'created .github/workflows/nitpicker-apps--web.yml',
        ],
      }),
    );
    expect(existsSync(path.join(root, WORKFLOW_PATH))).toBe(false);
  });

  it('exits 1 with the diff and leaves an existing workflow alone', () => {
    const existing = 'name: nitpicker\non: push\n';
    const root = project({ ...TYPESCRIPT, 'yarn.lock': '', [WORKFLOW_PATH]: existing });
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
    const root = project({ ...TYPESCRIPT, 'yarn.lock': '' });
    init(root, '--ci', 'github');

    expect(init(root, '--ci', 'github')).toEqual({
      exitCode: 0,
      stderrText: '',
      stdoutText: yarnReport([`${WORKFLOW_PATH} is already set up`], SET_UP),
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
