import { ruleEntry } from '../../../shared/reference/entry.mjs';
import { wordsOfCamelCase } from '../../../shared/reference/build/words.mjs';
import { paragraphsOf, splitFirstSentence } from '../../../shared/reference/build/text.mjs';
import { JAVA_FORMATTER_TOOLS, NOT_YOUR_JAVA_FORMATTER } from '../adapters/style/java-style.mjs';
import { CATALOG_TOOLS, readCatalog } from '../messages/rule-messages.mjs';
import { GRADLE_PRESETS, MAVEN_PRESETS } from '../adapters/gradle-presets.mjs';
import { readToolText } from './tool-text/tool-text.mjs';

export const JVM_ANALYZERS = { java: ['java'], kotlin: ['kotlin'] };
export const JVM_BUILDS = Object.fromEntries(
  GRADLE_PRESETS.map((preset) => [
    preset,
    ['gradle', ...(MAVEN_PRESETS.includes(preset) ? ['maven'] : [])],
  ]),
);

const PAGES = { pmd: 'java-pmd', checkstyle: 'java-checkstyle', spotbugs: 'java-spotbugs' };
const PMD_WHY =
  "PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.";
const CHECKSTYLE_WHY = {
  javadoc:
    "Google style asks for Javadoc in the shape it prescribes, and Checkstyle's Google checks report a missing or malformed comment; the formatter does not write Javadoc.",
  naming:
    'Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.',
  layout:
    "Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.",
  coding:
    "Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.",
};
const LAYOUT_CATEGORIES = new Set(['whitespace', 'indentation', 'blocks', 'sizes']);
const CHECKSTYLE_DOCUMENTATION = 'https://checkstyle.org/checks';
const SPOTBUGS_DOCUMENTATION = 'https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html';
const SPOTBUGS_CATEGORIES = {
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
const NO_ROUTE =
  'The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.';

function allowedOf({ fix, layout }) {
  if (layout === true) {
    return { allowed: LAYOUT_ALLOWED };
  }
  return typeof fix === 'string' ? { allowed: fix } : {};
}

const FENCE = /^\s*```/mu;
const SENTENCE_BREAK = /(?<=[.!?])\s+/u;

function withoutLeadIn(text) {
  const sentences = text.split(SENTENCE_BREAK);
  return sentences.at(-1).endsWith(':') ? sentences.slice(0, -1).join(' ') : text;
}

function pmdText(rule, texts) {
  const own = texts.rules[rule];
  const text = own?.renamedTo === undefined ? own : texts.rules[own.renamedTo];
  if (text === undefined) {
    throw new Error(`The PMD ${texts.version} snapshot has no rule ${rule}`);
  }
  const [first, ...rest] = paragraphsOf(text.description.split(FENCE)[0]);
  const { first: summary, rest: more } = splitFirstSentence(first);
  const why = withoutLeadIn([more, ...rest].filter(Boolean).join(' '));
  return {
    summary,
    why: why === '' ? PMD_WHY : why,
    links: [{ label: 'PMD rule documentation', url: text.url }],
  };
}

function checkstyleCheck(rule, texts) {
  const name = Object.keys(texts.rules)
    .filter((check) => rule.startsWith(check))
    .toSorted((a, b) => b.length - a.length)[0];
  if (name === undefined) {
    throw new Error(`The Checkstyle ${texts.version} snapshot has no check for ${rule}`);
  }
  return { name, category: texts.rules[name].category };
}

function checkstyleText(rule, texts, { layout }) {
  const { name, category } = checkstyleCheck(rule, texts);
  const kind = layout === true || LAYOUT_CATEGORIES.has(category) ? 'layout' : category;
  return {
    summary: wordsOfCamelCase(name),
    why: CHECKSTYLE_WHY[kind] ?? CHECKSTYLE_WHY.coding,
    links: [
      {
        label: 'Checkstyle check documentation',
        url: `${CHECKSTYLE_DOCUMENTATION}/${category.replaceAll('.', '/')}/${name.toLowerCase()}.html`,
      },
    ],
  };
}

function spotbugsText(rule, texts) {
  const text = texts.rules[rule];
  if (text === undefined) {
    throw new Error(`The SpotBugs ${texts.version} snapshot has no pattern ${rule}`);
  }
  const [title, what] = SPOTBUGS_CATEGORIES[text.category];
  return {
    summary: `A SpotBugs ${title} pattern, \`${rule}\`.`,
    why: `SpotBugs reports ${what}, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.`,
    links: [{ label: 'SpotBugs bug description', url: `${SPOTBUGS_DOCUMENTATION}#${text.anchor}` }],
  };
}

const TOOL_TEXT = { pmd: pmdText, checkstyle: checkstyleText, spotbugs: spotbugsText };

function entryOf({ tool, rule, fields }, texts) {
  return ruleEntry({
    tool,
    rule,
    page: PAGES[tool],
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    ...TOOL_TEXT[tool](rule, texts, fields),
    ...allowedOf(fields),
    exception: {
      key: 'exceptions',
      rule: `${tool}/${rule}`,
      ...(fields.mayBeIntended ? {} : { note: NO_ROUTE }),
    },
  });
}

/** The entries of the PMD, Checkstyle and SpotBugs rules that have a message catalog. */
export function catalogRuleEntries() {
  return CATALOG_TOOLS.flatMap((tool) => {
    const texts = readToolText(tool);
    return Object.entries(readCatalog(tool)).map(([rule, fields]) =>
      entryOf({ tool, rule, fields }, texts),
    );
  });
}
