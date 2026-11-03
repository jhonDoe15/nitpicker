import { isTable } from '../../configuration/project-files.mjs';

const OPTION_LINTERS = {
  'flake8-annotations': ['ANN'],
  'flake8-bandit': ['S'],
  'flake8-boolean-trap': ['FBT'],
  'flake8-bugbear': ['B'],
  'flake8-builtins': ['A'],
  'flake8-comprehensions': ['C4'],
  'flake8-copyright': ['CPY'],
  'flake8-errmsg': ['EM'],
  'flake8-gettext': ['INT'],
  'flake8-implicit-str-concat': ['ISC'],
  'flake8-import-conventions': ['ICN'],
  'flake8-pytest-style': ['PT'],
  'flake8-quotes': ['Q'],
  'flake8-self': ['SLF'],
  'flake8-tidy-imports': ['TID'],
  'flake8-type-checking': ['TC'],
  'flake8-unused-arguments': ['ARG'],
  isort: ['I'],
  mccabe: ['C90'],
  'pep8-naming': ['N'],
  pycodestyle: ['E', 'W'],
  pydoclint: ['DOC'],
  pydocstyle: ['D'],
  pyflakes: ['F'],
  pylint: ['PLC', 'PLE', 'PLR', 'PLW'],
  pyupgrade: ['UP'],
  ruff: ['RUF'],
};

function ofLinter(selector, prefix) {
  return (
    selector.startsWith(prefix) &&
    (selector.length === prefix.length || /\d/u.test(selector.charAt(prefix.length)))
  );
}

function reachesNitpicker(key, value, nitpickerCodes) {
  const prefixes = isTable(value) ? OPTION_LINTERS[key] : undefined;
  return (
    prefixes === undefined ||
    [...nitpickerCodes].some((code) => prefixes.some((prefix) => ofLinter(code, prefix)))
  );
}

export function optionsBesideNitpicker(options, nitpickerCodes) {
  return Object.fromEntries(
    Object.entries(options).filter(([key, value]) => !reachesNitpicker(key, value, nitpickerCodes)),
  );
}

export function optionsOverNitpicker(options, nitpickerCodes) {
  return Object.entries(options)
    .filter(([key, value]) => reachesNitpicker(key, value, nitpickerCodes))
    .map(([key]) => key)
    .toSorted();
}
