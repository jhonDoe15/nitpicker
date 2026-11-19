import {
  paragraphsOf,
  ruleEntry,
  splitFirstSentence,
  wordsOfCamelCase,
} from './typed/entry-views.mts';
import type { EntryFields, RuleEntry } from './typed/entry-views.mts';
import type { CatalogEntry } from '../messages/rule-messages.mts';
import type { CheckstyleText, PmdText, SpotbugsText, ToolText } from './typed/tool-text-types.mts';
import { JAVA_FORMATTER_TOOLS, NOT_YOUR_JAVA_FORMATTER } from '../adapters/style/java-style.mts';
import { CATALOG_TOOLS, readCatalog } from '../messages/rule-messages.mts';
import { GRADLE_PRESETS, MAVEN_PRESETS } from '../adapters/gradle-presets.mts';
import { readToolText } from './tool-text/tool-text.mts';

export const JVM_ANALYZERS: Record<string, string[]> = { java: ['java'], kotlin: ['kotlin'] };
export const JVM_BUILDS: Record<string, string[]> = Object.fromEntries(
  GRADLE_PRESETS.map((preset) => [
    preset,
    ['gradle', ...(MAVEN_PRESETS.includes(preset) ? ['maven'] : [])],
  ]),
);

const PAGES: Record<string, string> = {
  pmd: 'java-pmd',
  checkstyle: 'java-checkstyle',
  spotbugs: 'java-spotbugs',
};
const PMD_WHY = [
  "PMD's errorprone, bestpractices, performance and multithreading categories, a broad-catch rule",
  'and the boolean simplification rules run on main and test sources. Each rule names one allowed',
  'form of something Java allows several ways, or a defect.',
].join(' ');
const CHECKSTYLE_WHY: Record<string, string> = {
  javadoc:
    "Google style asks for Javadoc in the shape it prescribes, and Checkstyle's Google checks report a missing or malformed comment; the formatter does not write Javadoc.",
  naming:
    'Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.',
  layout:
    "Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.",
  coding:
    "Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.",
};
const CHECKSTYLE_OWN: Record<string, { summary: string; why: string }> = {
  ConstantName: {
    summary: 'A constant named in a form other than UPPER_SNAKE_CASE.',
    why: "Nitpicker's Checkstyle configuration fixes one form for a constant name, so constants read the same everywhere; a logger may be `log` or `logger`.",
  },
  MagicNumber: {
    summary: 'A number written inline that has no name.',
    why: "Nitpicker's Checkstyle configuration reports a number whose meaning the code does not say; a named constant says it once.",
  },
  VisibilityModifier: {
    summary: 'A field that is not private.',
    why: "Nitpicker's Checkstyle configuration keeps state behind the class, so a caller cannot change a field in a way the class does not expect; public final fields are allowed.",
  },
};
const LAYOUT_CATEGORIES = new Set(['whitespace', 'indentation', 'blocks', 'sizes']);
const CHECKSTYLE_DOCUMENTATION = 'https://checkstyle.org/checks';
const SPOTBUGS_DOCUMENTATION = 'https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html';
const SPOTBUGS_CATEGORIES: Record<string, [string, string]> = {
  BAD_PRACTICE: ['bad practice', 'code that breaks a recommended Java practice'],
  CORRECTNESS: ['correctness', 'code that is probably a bug'],
  MT_CORRECTNESS: ['multithreaded correctness', 'code that is probably a concurrency bug'],
  MALICIOUS_CODE: [
    'malicious code vulnerability',
    'code that untrusted code could abuse, such as an exposed mutable field',
  ],
  PERFORMANCE: ['performance', 'code that is correct but needlessly slow or wasteful'],
  SECURITY: ['security', 'code that untrusted input can exploit'],
  STYLE: ['dodgy code', 'code that is confusing or likely to lead to errors'],
  I18N: ['internationalization', 'code that depends on the default locale or encoding'],
  EXPERIMENTAL: ['experimental', 'code that an experimental SpotBugs detector reports'],
  NOISE: ['noise', 'a pattern SpotBugs uses to measure noise'],
};

const FORMATTER_LABELS = Object.values(JAVA_FORMATTER_TOOLS).map(({ label }) => `\`${label}\``);
const LAYOUT_ALLOWED = `Run the formatter of the project (${[...new Set(FORMATTER_LABELS)].join(', ')}) on the file; with no formatter, fix the layout by hand. ${NOT_YOUR_JAVA_FORMATTER}`;
const NO_ROUTE = [
  'The message gives no exception route because the flagged code is a defect or has one exact fix;',
  'an entry still lifts it if a reviewer agrees.',
].join(' ');

const CHECKSTYLE_ID_MODULES: Record<string, string> = {
  BoxComments: 'TodoComment',
  TodoFormat: 'TodoComment',
  singleLineCommentStartWithSpace: 'MatchXpath',
};

type TextFields = Pick<EntryFields, 'summary' | 'why' | 'links'>;

function allowedOf({ fix, layout }: CatalogEntry): { allowed?: string } {
  if (layout === true) {
    return { allowed: LAYOUT_ALLOWED };
  }
  return typeof fix === 'string' ? { allowed: fix } : {};
}

const FENCE = /^\s*```/mu;
const SENTENCE_BREAK = /(?<=[.!?])\s+/u;

function withoutLeadIn(text: string): string {
  const sentences = text.split(SENTENCE_BREAK);
  return sentences.at(-1)?.endsWith(':') === true ? sentences.slice(0, -1).join(' ') : text;
}

function pmdText(rule: string, texts: ToolText<PmdText>): TextFields {
  const own = texts.rules[rule];
  const text = own?.renamedTo === undefined ? own : texts.rules[own.renamedTo];
  if (text === undefined) {
    throw new Error(`The PMD ${texts.version} snapshot has no rule ${rule}`);
  }
  const [first = '', ...rest] = paragraphsOf((text.description ?? '').split(FENCE)[0] ?? '');
  const { first: summary, rest: more } = splitFirstSentence(first);
  const why = withoutLeadIn([more, ...rest].filter((part) => part !== '').join(' '));
  return {
    summary,
    why: why === '' ? PMD_WHY : why,
    links: [{ label: 'PMD rule documentation', url: text.url ?? '' }],
  };
}

function checkstyleCheck(
  rule: string,
  texts: ToolText<CheckstyleText>,
): { name: string; category: string } {
  const module = CHECKSTYLE_ID_MODULES[rule] ?? rule;
  const name = Object.keys(texts.rules)
    .filter((check) => module.startsWith(check))
    .toSorted((a, b) => b.length - a.length)[0];
  if (name === undefined) {
    throw new Error(`The Checkstyle ${texts.version} snapshot has no check for ${rule}`);
  }
  return { name, category: texts.rules[name]?.category ?? '' };
}

function checkstyleText(
  rule: string,
  texts: ToolText<CheckstyleText>,
  { layout }: CatalogEntry,
): TextFields {
  const { name, category } = checkstyleCheck(rule, texts);
  const own = CHECKSTYLE_OWN[name];
  const kind = layout === true || LAYOUT_CATEGORIES.has(category) ? 'layout' : category;
  return {
    summary: own?.summary ?? wordsOfCamelCase(name),
    why: own?.why ?? CHECKSTYLE_WHY[kind] ?? CHECKSTYLE_WHY['coding'],
    links: [
      {
        label: 'Checkstyle check documentation',
        url: `${CHECKSTYLE_DOCUMENTATION}/${category.replaceAll('.', '/')}/${name.toLowerCase()}.html`,
      },
    ],
  };
}

function spotbugsText(rule: string, texts: ToolText<SpotbugsText>): TextFields {
  const text = texts.rules[rule];
  if (text === undefined) {
    throw new Error(`The SpotBugs ${texts.version} snapshot has no pattern ${rule}`);
  }
  const [title, what] = SPOTBUGS_CATEGORIES[text.category] ?? ['', ''];
  return {
    summary: `A SpotBugs ${title} pattern, \`${rule}\`.`,
    why: `SpotBugs reports ${what}, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.`,
    links: [{ label: 'SpotBugs bug description', url: `${SPOTBUGS_DOCUMENTATION}#${text.anchor}` }],
  };
}

function describeBy(tool: string): (rule: string, fields: CatalogEntry) => TextFields {
  if (tool === 'pmd') {
    const texts = readToolText(tool);
    return (rule) => pmdText(rule, texts);
  }
  if (tool === 'checkstyle') {
    const texts = readToolText(tool);
    return (rule, fields) => checkstyleText(rule, texts, fields);
  }
  const texts = readToolText('spotbugs');
  return (rule) => spotbugsText(rule, texts);
}

function entryOf(
  { tool, rule, fields }: { tool: string; rule: string; fields: CatalogEntry },
  describe: (rule: string, fields: CatalogEntry) => TextFields,
): RuleEntry {
  return ruleEntry({
    tool,
    rule,
    page: PAGES[tool],
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    ...describe(rule, fields),
    ...allowedOf(fields),
    exception: {
      key: 'exceptions',
      rule: `${tool}/${rule}`,
      ...(fields.mayBeIntended ? {} : { note: NO_ROUTE }),
    },
  });
}

export function catalogRuleEntries({
  skippedPmd = new Set<string>(),
}: { skippedPmd?: Set<string> } = {}): RuleEntry[] {
  return CATALOG_TOOLS.flatMap((tool) => {
    const describe = describeBy(tool);
    return Object.entries(readCatalog(tool))
      .filter(([rule]) => tool !== 'pmd' || !skippedPmd.has(rule))
      .map(([rule, fields]) => entryOf({ tool, rule, fields }, describe));
  });
}
