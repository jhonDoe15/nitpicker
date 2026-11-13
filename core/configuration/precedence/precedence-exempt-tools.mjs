import { GO_LINT_TOOLS } from '../../../languages/go/adapters/configuration/go-config.mjs';

const OWN_ANALYZER =
  "nitpicker's own analyzer: it has no tool config file of the project to read, so there is nothing to layer";

const GO_PINNED_LINTER =
  'runs from the linter program nitpicker pins with its own checks enabled; the project\'s golangci-lint selection would switch checks off, so only the formatter options and the staticcheck checks are read (see "gofumpt", "goimports" and "staticcheck")';

const PRECEDENCE_EXEMPT_TOOLS = new Map([
  [
    'oxlint',
    {
      presets: ['typescript', 'javascript'],
      reason:
        'the lint engine, chosen with "tools.eslint.engine"; "tools.eslint.precedence" layers the project\'s ESLint config on both engines',
    },
  ],
  [
    'vitest',
    {
      presets: ['typescript', 'javascript'],
      reason:
        'a test runner, covered by "tools.tests.precedence" (retries) and "tools.tests.runner"',
    },
  ],
  [
    'basedpyright',
    {
      presets: ['python'],
      reason:
        'a variant of the type checker covered by "tools.pyright.precedence", which reads its tables too',
    },
  ],
  [
    'coverage-py',
    {
      presets: ['python'],
      reason: 'covered by "tools.coverage.precedence"',
    },
  ],
  [
    'import-linter',
    {
      presets: ['python'],
      reason:
        "its contracts are the project's own and nitpicker has none to merge them with; they run as written and a weakening edit is a policy change",
    },
  ],
  [
    'archunit',
    {
      presets: ['java', 'kotlin'],
      reason:
        "its rules are the project's own test classes, run as written, and nitpicker has none to merge them with",
    },
  ],
  [
    'jacoco',
    {
      presets: ['java', 'kotlin'],
      reason:
        "nitpicker's init script applies its own JaCoCo agent and report; the coverage numbers feed the changed-line checks, so a project's report settings cannot be layered without moving them",
    },
  ],
  [
    'google-java-format',
    {
      presets: ['java', 'kotlin'],
      reason:
        'the formatter is followed from the build file as a layout convention (see "conventions" with "java.formatter"), not as a config file',
    },
  ],
  [
    'palantir-java-format',
    {
      presets: ['java', 'kotlin'],
      reason:
        'the formatter is followed from the build file as a layout convention (see "conventions" with "java.formatter"), not as a config file',
    },
  ],
  [
    'javac',
    {
      presets: ['java', 'kotlin'],
      reason:
        'compiles with the compiler flags nitpicker sets; the build file decides the language level only',
    },
  ],
  [
    'kotlinc',
    {
      presets: ['kotlin'],
      reason:
        'compiles with the compiler flags nitpicker sets; the build file decides the language level only',
    },
  ],
  [
    'forbiddenapis',
    {
      presets: ['java', 'kotlin'],
      reason: "nitpicker's own signature lists; there is no project config of the same kind",
    },
  ],
  ['spring', { presets: ['java', 'kotlin'], reason: OWN_ANALYZER }],
  ['dependencies', { presets: ['java', 'kotlin', 'python'], reason: OWN_ANALYZER }],
  ['kotlin-source', { presets: ['kotlin'], reason: OWN_ANALYZER }],
  [
    'crap',
    { presets: ['java', 'kotlin', 'python', 'typescript', 'javascript'], reason: OWN_ANALYZER },
  ],
  [
    'structure',
    {
      presets: ['java', 'kotlin', 'python', 'typescript', 'javascript', 'go'],
      reason: OWN_ANALYZER,
    },
  ],
  [
    'coupling',
    { presets: ['java', 'kotlin', 'python', 'typescript', 'javascript'], reason: OWN_ANALYZER },
  ],
  ['facts', { presets: ['java', 'kotlin', 'python', 'go'], reason: OWN_ANALYZER }],
  [
    'test-runtime',
    {
      presets: ['java', 'kotlin', 'python', 'typescript', 'javascript', 'go'],
      reason: OWN_ANALYZER,
    },
  ],
  [
    'repository-hygiene',
    {
      presets: ['java', 'kotlin', 'python', 'typescript', 'javascript', 'go'],
      reason: OWN_ANALYZER,
    },
  ],
  [
    'change-history',
    {
      presets: ['java', 'kotlin', 'python', 'typescript', 'javascript', 'go'],
      reason: OWN_ANALYZER,
    },
  ],
  [
    'mutation',
    {
      presets: ['typescript', 'javascript', 'go'],
      reason:
        'covered by "tools.stryker.precedence" with the TypeScript and JavaScript presets; the Go mutation runner is nitpicker\'s own',
    },
  ],
  [
    'coverage',
    {
      presets: ['typescript', 'javascript'],
      reason:
        "the test runner's coverage report, produced with nitpicker's options so the changed-line checks can read it",
    },
  ],
  [
    'dead-code',
    { presets: ['typescript', 'javascript'], reason: 'covered by "tools.knip.precedence"' },
  ],
  ['entry-points', { presets: ['typescript', 'javascript'], reason: OWN_ANALYZER }],
  ['coding-standards', { presets: ['typescript', 'javascript'], reason: OWN_ANALYZER }],
  [
    'dependency-architecture',
    {
      presets: ['typescript', 'javascript'],
      reason: 'covered by "tools.dependency-cruiser.precedence"',
    },
  ],
  [
    'duplicates',
    {
      presets: ['java', 'kotlin', 'python', 'typescript', 'javascript'],
      reason: 'covered by "tools.jscpd.precedence"',
    },
  ],
  ['deadcode', { presets: ['go'], reason: GO_PINNED_LINTER }],
  [
    'vet',
    {
      presets: ['go'],
      reason: 'go vet runs as the toolchain ships it, with the build tags from "go.buildTags"',
    },
  ],
  ['go-rules', { presets: ['go'], reason: OWN_ANALYZER }],
  ['python-rules', { presets: ['python'], reason: OWN_ANALYZER }],
  [
    'revive',
    {
      presets: ['go'],
      reason:
        'runs as a library with one fixed setting per configurable rule, so a project revive.toml is not read; an exception with a reason (the "revive/<rule>" finding) is the route for code that is right',
    },
  ],
  [
    'gosec',
    {
      presets: ['go'],
      reason:
        'runs every rule with fixed limits, so a project .gosec.json or #nosec comment is not read; an exception with a reason (the "gosec/<rule>" finding) is the route for code that is right',
    },
  ],
  [
    'ruff-format',
    { presets: ['python'], reason: 'the format check of ruff, covered by "tools.ruff.precedence"' },
  ],
  [
    'test-console',
    {
      presets: ['python'],
      reason:
        'reads the console output of the test run, which has no config of its own; the run follows "tools.tests.precedence"',
    },
  ],
  ...GO_LINT_TOOLS.filter(
    (tool) => !['vet', 'staticcheck', 'go-rules', 'deadcode', 'revive', 'gosec'].includes(tool),
  ).map((tool) => [tool, { presets: ['go'], reason: GO_PINNED_LINTER }]),
]);

export function precedenceExemption(tool) {
  return PRECEDENCE_EXEMPT_TOOLS.get(tool);
}

export function precedenceExemptions() {
  return [...PRECEDENCE_EXEMPT_TOOLS];
}
