import { textOf } from '../../../shared/values/readers.mts';

const SKILL_SOURCE = 'jhonDoe15/nitpicker#v<version>';
const TYPESCRIPT_PIN = 'typescript@>=5.7 <6.1.0';
const OTHER_TOOLS = '@types/node vitest @vitest/coverage-v8';
const SCRIPT_MISSING =
  '  Install what nitpicker needs from your project (missing: nitpicker@<version>,' +
  ` ${TYPESCRIPT_PIN}, ${OTHER_TOOLS.replaceAll(' ', ', ')}):`;
const SCRIPT_INSTALL = `    npm install --save-dev nitpicker@<version> '${TYPESCRIPT_PIN}' ${OTHER_TOOLS}`;
const FROM_FILES = 'found from their project files';
const FROM_DECLARATION = 'found from the workspace or build declaration';
const WITH = '        with:';
const PYTHON = 'python';
const JAVA = 'java';
const TYPESCRIPT = 'typescript';
const JAVASCRIPT = 'javascript';

function heading(count: number, origin: string): string[] {
  return [`nitpicker init: a monorepo of ${String(count)} projects, ${origin}`, ''];
}

function noOwnConfig(preset: string): string {
  return `  No config of its own needed: the monorepo run gives it the "${preset}" preset.`;
}

const LANGUAGE_NAMES = new Map([
  [TYPESCRIPT, 'TypeScript'],
  [JAVASCRIPT, 'JavaScript'],
]);

function scriptMember(
  folder: string,
  preset: string,
  closing: readonly string[] = [noOwnConfig(preset)],
): string[] {
  return [
    `${folder}: ${textOf(LANGUAGE_NAMES.get(preset))}, npm, Vitest (preset "${preset}")`,
    SCRIPT_MISSING,
    SCRIPT_INSTALL,
    ...closing,
    '',
  ];
}

const POLYGLOT_MEMBERS = [
  'api: Python, pip, unittest, mypy, ruff (preset "python")',
  '  Install what nitpicker needs from your project (missing: coverage, mypy, pytest, mutmut>=3,<4):',
  "    python -m pip install coverage mypy pytest 'mutmut>=3,<4'",
  noOwnConfig(PYTHON),
  '',
  'service: Java, Gradle (preset "java")',
  '  There is no gradlew, so nitpicker runs gradle from the PATH. Install it, or add the wrapper.',
  '  Needs Java 21 or newer. nitpicker adds its own analysis tools to the build.',
  noOwnConfig(JAVA),
  '',
  ...scriptMember('web', TYPESCRIPT),
];

function skills(...languages: readonly string[]): string[] {
  return [
    'Install the agent skills:',
    ...languages.map(
      (language) => `  npx skills add ${SKILL_SOURCE} --skill nitpicker-${language}`,
    ),
    '',
  ];
}

const SHARED_SETTINGS = [
  'Settings that several projects share can live in one file, such as nitpicker.shared.json,' +
    ' that each project config names with "extends": "../nitpicker.shared.json".',
  '',
  'To add the agent guidance to AGENTS.md, run: npx nitpicker init --agents-md',
];

const CREATED_WORKFLOWS = ['created .github/workflows/nitpicker.yml', ''];

const OFFERED_WORKFLOW = [
  'To write .github/workflows/nitpicker.yml, run: npx nitpicker init --ci github',
  '',
];

const THEN_RUN = [
  'Then run `npx nitpicker` here to check a change in every project it touches, or `npx' +
    ' nitpicker --all` to survey them all.',
  '',
];

const DECLARATION_NOTE = [
  'The projects are found from the workspace or build declaration, so the top config needs no' +
    ' "projects" list.',
  '',
];

const KEPT_DIFF = [
  'nitpicker.config.json exists and was not changed. It lists no projects, so a run here' +
    ' would not gate the projects below it. The diff from your file to what init would write:',
  '',
  '--- nitpicker.config.json',
  '+++ nitpicker.config.json (nitpicker init)',
  '@@ -1,1 +1,19 @@',
  '-{ "exclude": ["docs/**"] }',
  '+{',
  '+  "exclude": [',
  '+    "docs/**"',
  '+  ],',
  '+  "projects": [',
  '+    {',
  '+      "path": "api",',
  '+      "preset": "python"',
  '+    },',
  '+    {',
  '+      "path": "service",',
  '+      "preset": "java"',
  '+    },',
  '+    {',
  '+      "path": "web",',
  '+      "preset": "typescript"',
  '+    }',
  '+  ]',
  '+}',
  '',
  'Apply the change by hand, or move nitpicker.config.json aside and run nitpicker init again.',
  '',
];

const KEPT_MEMBER_DIFF = [
  '  packages/b/nitpicker.config.json exists and was not changed. It sets no preset: add' +
    ' "preset": "javascript". The diff from your file to what init would write:',
  '',
  '  --- nitpicker.config.json',
  '+++ nitpicker.config.json (nitpicker init)',
  '@@ -1,1 +1,1 @@',
  '-{ "exclude": [] }',
  '+{ "preset": "javascript", "exclude": [] }',
  '',
  '  Apply the change by hand, or move packages/b/nitpicker.config.json aside and run' +
    ' nitpicker init again.',
];

export const POLYGLOT_OUTPUT = [
  ...heading(3, FROM_FILES),
  ...POLYGLOT_MEMBERS,
  'created nitpicker.config.json',
  '',
  ...skills(PYTHON, JAVA, TYPESCRIPT),
  ...SHARED_SETTINGS,
  ...CREATED_WORKFLOWS,
  ...THEN_RUN,
];

export const REPEATED_OUTPUT = [
  ...heading(3, 'listed in "projects" of nitpicker.config.json'),
  ...POLYGLOT_MEMBERS,
  'nitpicker.config.json already lists the projects.',
  '',
  ...skills(PYTHON, JAVA, TYPESCRIPT),
  ...SHARED_SETTINGS,
  '.github/workflows/nitpicker.yml is already set up',
  '',
  ...THEN_RUN,
];

export const KEPT_TOP_CONFIG_OUTPUT = [
  ...heading(3, FROM_FILES),
  ...POLYGLOT_MEMBERS,
  ...KEPT_DIFF,
  ...skills(PYTHON, JAVA, TYPESCRIPT),
  ...SHARED_SETTINGS,
  ...OFFERED_WORKFLOW,
  ...THEN_RUN,
];

export const WORKSPACE_OUTPUT = [
  ...heading(2, FROM_DECLARATION),
  ...scriptMember('packages/a', TYPESCRIPT),
  ...scriptMember('packages/b', JAVASCRIPT, ['  created packages/b/nitpicker.config.json']),
  ...DECLARATION_NOTE,
  ...skills(TYPESCRIPT, JAVASCRIPT),
  ...SHARED_SETTINGS,
  ...CREATED_WORKFLOWS,
  ...THEN_RUN,
];

export const KEPT_MEMBER_CONFIG_OUTPUT = [
  ...heading(2, FROM_DECLARATION),
  ...scriptMember('packages/b', JAVASCRIPT, KEPT_MEMBER_DIFF),
  ...scriptMember('packages/c', TYPESCRIPT),
  ...DECLARATION_NOTE,
  ...skills(JAVASCRIPT, TYPESCRIPT),
  ...SHARED_SETTINGS,
  ...OFFERED_WORKFLOW,
  ...THEN_RUN,
];

function workflow(setup: readonly string[]): string[] {
  return [
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
    '      - uses: actions/checkout@<pin>',
    WITH,
    '          fetch-depth: 0',
    '      - uses: actions/setup-node@<pin>',
    WITH,
    '          node-version: 24',
    ...setup,
    '      - name: nitpicker',
    '        uses: jhonDoe15/nitpicker@v<version>',
    WITH,
    '          package: nitpicker@<version>',
    "          node-version: ''",
    '          install-command: none',
    '',
  ];
}

export const POLYGLOT_WORKFLOW = workflow([
  '      - uses: actions/setup-python@<pin>',
  WITH,
  '          python-version: "3.13"',
  '      - uses: actions/setup-java@<pin>',
  WITH,
  '          distribution: temurin',
  '          java-version: 21',
  '      - run: python -m pip install -e .',
  '        working-directory: api',
  "      - run: python -m pip install coverage mypy pytest 'mutmut>=3,<4'",
  '        working-directory: api',
  '      - run: npm install',
  '        working-directory: web',
]);

export const WORKSPACE_WORKFLOW = workflow(['      - run: npm ci']);
