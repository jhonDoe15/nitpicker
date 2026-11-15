import { readToolText } from '../../../languages/java/reference/tool-text/tool-text.mjs';
import { readRuffSnapshot } from '../../../languages/python/reference/ruff-entries.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';

const RULES = 'rules';
const CATEGORY = 'category';

type Labels = readonly string[];
type CategoryLabels = Readonly<Record<string, Labels>>;
type Entry = Readonly<Record<string, unknown>>;

const toolText: (tool: string) => unknown = readToolText;
const ruffSnapshot: () => unknown = readRuffSnapshot;

const BUG: Labels = ['bug'];
const STYLE: Labels = ['style'];
const MAINTAINABILITY: Labels = ['maintainability'];
const SIMPLIFICATION: Labels = ['simplification'];
const RELIABILITY: Labels = ['reliability'];
const PERFORMANCE: Labels = ['performance'];
const SECURITY: Labels = ['security'];

const PMD: CategoryLabels = {
  bestpractices: MAINTAINABILITY,
  codestyle: STYLE,
  design: MAINTAINABILITY,
  documentation: STYLE,
  errorprone: BUG,
  multithreading: BUG,
  performance: PERFORMANCE,
  security: SECURITY,
};

const SPOTBUGS: CategoryLabels = {
  CORRECTNESS: BUG,
  MT_CORRECTNESS: BUG,
  BAD_PRACTICE: RELIABILITY,
  PERFORMANCE,
  SECURITY,
  MALICIOUS_CODE: SECURITY,
  STYLE: BUG,
  I18N: RELIABILITY,
  EXPERIMENTAL: BUG,
  NOISE: BUG,
};

const CHECKSTYLE_DESIGN = ['coding', 'design', 'metrics', 'sizes'];

const DETEKT: CategoryLabels = {
  comments: STYLE,
  complexity: MAINTAINABILITY,
  coroutines: ['bug', 'async'],
  'empty-blocks': SIMPLIFICATION,
  exceptions: RELIABILITY,
  naming: STYLE,
  performance: PERFORMANCE,
  'potential-bugs': BUG,
  style: STYLE,
};

const RUFF: CategoryLabels = {
  'flake8-unused-arguments': SIMPLIFICATION,
  'flake8-async': ['performance', 'async'],
  'flake8-bugbear': BUG,
  'flake8-blind-except': RELIABILITY,
  'flake8-comprehensions': SIMPLIFICATION,
  'flake8-datetimez': BUG,
  pycodestyle: STYLE,
  eradicate: SIMPLIFICATION,
  Pyflakes: BUG,
  flynt: SIMPLIFICATION,
  refurb: SIMPLIFICATION,
  'flake8-logging-format': PERFORMANCE,
  'flake8-logging': BUG,
  'pep8-naming': STYLE,
  Perflint: PERFORMANCE,
  'flake8-pie': SIMPLIFICATION,
  Pylint: BUG,
  'flake8-pytest-style': ['tests'],
  'flake8-use-pathlib': STYLE,
  'flake8-return': SIMPLIFICATION,
  'Ruff-specific rules': BUG,
  'flake8-bandit': SECURITY,
  'flake8-simplify': SIMPLIFICATION,
  'flake8-debugger': BUG,
  'flake8-print': STYLE,
  tryceratops: RELIABILITY,
  pyupgrade: SIMPLIFICATION,
};

const ERRORPRONE_TAGS: CategoryLabels = {
  LikelyError: BUG,
  FragileCode: RELIABILITY,
  Style: STYLE,
  Performance: PERFORMANCE,
  Simplification: SIMPLIFICATION,
  Refactoring: MAINTAINABILITY,
};

type Categories = (rule: string) => string | undefined;

function snapshotCategories(tool: string, field: string): Categories {
  const rules = fieldOf(toolText(tool), RULES);
  return (rule) => {
    const value = fieldOf(fieldOf(rules, rule), field);
    return value === undefined ? undefined : textOf(value);
  };
}

function checkstyleCategories(): Categories {
  const rules = fieldOf(toolText('checkstyle'), RULES);
  const names = Object.keys(typeof rules === 'object' && rules !== null ? rules : {}).toSorted(
    (left, right) => right.length - left.length,
  );
  return (rule) => {
    const name = names.find((candidate) => rule.startsWith(candidate));
    return name === undefined ? undefined : textOf(fieldOf(fieldOf(rules, name), CATEGORY));
  };
}

function ruffCategories(): Categories {
  const rules = fieldOf(ruffSnapshot(), RULES);
  const linters = new Map(
    (Array.isArray(rules) ? rules : []).map((rule) => [
      textOf(fieldOf(rule, 'code')),
      textOf(fieldOf(rule, 'linter')),
    ]),
  );
  return (rule) => linters.get(rule);
}

function errorProneLabels(): (rule: string) => Labels | undefined {
  const rules = fieldOf(toolText('errorprone'), RULES);
  return (rule) => {
    const tags = fieldOf(fieldOf(rules, rule), 'tags');
    const [first] = textOf(tags ?? '').split(',');
    return tags === undefined ? undefined : ERRORPRONE_TAGS[first ?? ''];
  };
}

function viaCategory(
  categories: Categories,
  labels: CategoryLabels,
): (rule: string) => Labels | undefined {
  return (rule) => {
    const category = categories(rule);
    return category === undefined ? undefined : labels[category];
  };
}

function checkstyleLabels(): (rule: string) => Labels | undefined {
  const categories = checkstyleCategories();
  return (rule) => {
    const category = categories(rule);
    if (category === undefined) {
      return undefined;
    }
    return CHECKSTYLE_DESIGN.includes(category) ? MAINTAINABILITY : STYLE;
  };
}

function detektLabels(rule: string): Labels | undefined {
  const [prefix, ruleSet] = rule.split('.');
  return prefix === 'detekt' ? DETEKT[ruleSet ?? ''] : undefined;
}

export function upstreamLabelResolver(): (entry: Entry) => Labels | undefined {
  const byTool: Readonly<Record<string, (rule: string) => Labels | undefined>> = {
    pmd: viaCategory(snapshotCategories('pmd', CATEGORY), PMD),
    spotbugs: viaCategory(snapshotCategories('spotbugs', CATEGORY), SPOTBUGS),
    checkstyle: checkstyleLabels(),
    detekt: detektLabels,
    ruff: viaCategory(ruffCategories(), RUFF),
    errorprone: errorProneLabels(),
  };
  return (entry) => byTool[textOf(entry['tool'])]?.(textOf(entry['rule']));
}
