import { ruleEntry } from '../../../shared/reference/entry.mjs';
import { RULE_HINTS } from '../rules/rule-hints.mjs';
import { allowedOf } from './hint-text.mjs';

const PYTHON = { python: ['python'] };
const PYTHON_EXCEPTIONS = 'python.exceptions';
const PYRIGHT_RULE = '^(?:report[A-Z]\\w*|type-error)$';
const TYPE_CHECKERS = [
  { tool: 'mypy', pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$', placeholder: '<error code>' },
  { tool: 'pyright', pattern: PYRIGHT_RULE, placeholder: '<rule>', barePattern: true },
  { tool: 'basedpyright', pattern: PYRIGHT_RULE, placeholder: '<rule>', barePattern: true },
];
const TYPE_CHECKER_ALLOWED = 'Fix the type; inline ignores are banned.';
const TYPES_DOCS = [{ label: 'Python preset guide', path: 'docs/python-preset.md' }];

function typeCheckerFamily({ tool, pattern, placeholder, barePattern }) {
  return ruleEntry({
    tool,
    rule: placeholder,
    pattern,
    ...(barePattern ? { barePattern } : {}),
    page: 'python-types',
    analyzers: PYTHON,
    summary: `A diagnostic of ${tool}, named by its ${placeholder}.`,
    why: 'The Python preset runs the type checker the project picks (`python.typeChecker`: mypy, pyright or basedpyright) and fails a diagnostic the change adds.',
    allowed: TYPE_CHECKER_ALLOWED,
    exception: { key: PYTHON_EXCEPTIONS, rule: placeholder },
    docs: TYPES_DOCS,
  });
}

function typeCheckerHinted(hint) {
  return hint.rules === undefined
    ? []
    : hint.rules.map((rule) =>
        ruleEntry({
          tool: hint.tool,
          rule,
          page: 'python-types',
          analyzers: PYTHON,
          summary: `A ${hint.tool} diagnostic with the rule ${rule}.`,
          why: 'The Python preset runs the type checker the project picks and fails a diagnostic the change adds.',
          allowed: allowedOf(hint),
          exception:
            hint.exception === false
              ? { note: 'It has no exception route.' }
              : { key: PYTHON_EXCEPTIONS, rule },
          docs: TYPES_DOCS,
        }),
      );
}

function typeCheckerEntries() {
  const hinted = RULE_HINTS.filter(({ tool }) =>
    TYPE_CHECKERS.some((checker) => checker.tool === tool),
  );
  return [...TYPE_CHECKERS.map(typeCheckerFamily), ...hinted.flatMap(typeCheckerHinted)];
}

const OTHER_ROWS = [
  {
    tool: 'import-linter',
    rule: 'contract-broken',
    page: 'python-types',
    summary: 'An import that breaks an import-linter contract.',
    why: 'The Python preset checks the import contracts of the project (`python.importLinter`) so that layers keep their direction.',
    allowed: 'Remove the import; move the code to the layer that may depend on it.',
  },
  {
    tool: 'dependencies',
    rule: 'unused-dependency',
    page: 'python-types',
    summary: 'A dependency in the project manifest that no code imports.',
    why: 'Unused dependencies add install time and attack surface.',
    allowed: 'Remove it from the manifest.',
  },
  {
    tool: 'dependencies',
    rule: 'unlisted-dependency',
    page: 'python-types',
    summary: 'A package that code imports but the project manifest does not list.',
    why: 'An import that works only because another package pulls it in breaks when that package changes.',
    allowed: 'Add it to the project dependencies (a dev dependency group for tests and tooling).',
  },
  {
    tool: 'dependencies',
    rule: 'no-dev-dependency-in-production',
    page: 'python-types',
    summary: 'Production code imports a package that is only a dev dependency.',
    why: 'A production install does not have dev dependencies, so the import fails there.',
    allowed:
      'Move the dependency to the runtime dependencies, or stop importing it in production code.',
  },
  {
    tool: 'coupling',
    rule: 'package-cycle',
    page: 'python-nitpicker',
    summary: 'A package that is in a dependency cycle with other packages.',
    why: 'A cycle makes packages impossible to load, test or replace one at a time.',
    allowed:
      'Move the shared types down into one of them, or invert one dependency behind an interface.',
  },
  {
    tool: 'coupling',
    rule: 'no-production-cycles',
    page: 'python-nitpicker',
    summary: 'A module that is in an import cycle with other modules of its package.',
    why: 'A cycle makes modules impossible to load, test or replace one at a time.',
    allowed:
      'Move what they share into a module both import, or pass it in instead of importing it back.',
  },
  {
    tool: 'coupling',
    rule: 'no-import-outside-roots',
    page: 'python-nitpicker',
    summary: 'Production code imports a project module outside `python.sourceRoots`.',
    why: 'Code outside the source roots is not checked by the gate, so production code must not depend on it.',
    allowed:
      'Move the imported code under a source root, or add its folder to `python.sourceRoots` so the gate checks it.',
    exception: { note: 'It has no exception: set `python.sourceRoots`.' },
  },
  {
    tool: 'mutmut',
    rule: 'mutant-ignored',
    page: 'python-types',
    summary:
      'A `# pragma: no mutate` comment or a mutmut ignore pattern that hides code from mutation testing.',
    why: 'An ignored mutant cannot fail, so an ignore comment hides code from the mutation check.',
    allowed: 'Remove the comment or pattern and test the code.',
    exception: { note: 'Ignore comments and patterns are not an exception route.' },
    analyzers: { python: ['mutation'] },
  },
  {
    tool: 'python',
    rule: 'no-tests-ran',
    page: 'python-nitpicker',
    summary: 'The test run collected no tests.',
    why: 'Coverage, CRAP and mutation results mean nothing when no test ran.',
    allowed: 'Keep the project tests, or restore the ones the change removed.',
    exception: { note: 'It has no exception: restore the tests.' },
  },
  {
    tool: 'ruff-format',
    rule: 'format',
    findingTools: ['black'],
    page: 'python-nitpicker',
    summary: 'A file is not formatted with the formatter of the project.',
    why: 'One layout for every file, so that reviews are about the code and not its formatting.',
    allowed: 'Format the file with the formatter (`python.formatter`: ruff or black).',
    exception: { note: 'It has no exception: format the file.' },
  },
];

function otherEntry({ exception, analyzers, ...fields }) {
  return ruleEntry({
    analyzers: analyzers ?? PYTHON,
    docs: TYPES_DOCS,
    exception: exception ?? { key: PYTHON_EXCEPTIONS, rule: fields.rule },
    ...fields,
  });
}

/** The entries of the Python rules that are neither ruff, `python-rules` nor in the shared catalog. */
export function pythonToolEntries() {
  return [...typeCheckerEntries(), ...OTHER_ROWS.map(otherEntry)];
}
