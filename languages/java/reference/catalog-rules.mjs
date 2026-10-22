import { ruleEntry } from '../../../shared/reference/entry.mjs';
import { wordsOfCamelCase, wordsOfConstant } from '../../../shared/reference/words.mjs';
import { JAVA_FORMATTER_TOOLS, NOT_YOUR_JAVA_FORMATTER } from '../adapters/style/java-style.mjs';
import { CATALOG_TOOLS, readCatalog } from '../messages/rule-messages.mjs';

export const JVM_ANALYZERS = { java: ['java'], kotlin: ['kotlin'] };
export const JVM_BUILDS = ['gradle', 'maven'];

const PAGES = { pmd: 'java-pmd', checkstyle: 'java-checkstyle', spotbugs: 'java-spotbugs' };

const WHY = {
  pmd: "PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.",
  checkstyle:
    "Checkstyle's Google style checks the layout and naming the formatter does not fix. A layout finding means the file is not formatted, and the formatter is the allowed form.",
  spotbugs:
    'SpotBugs reports a bug pattern in the compiled classes of the main sources, at medium confidence and above. Every pattern it reports is a finding that fails the gate when the change adds it.',
};

const FORMATTER_LABELS = Object.values(JAVA_FORMATTER_TOOLS).map(({ label }) => `\`${label}\``);
const LAYOUT_ALLOWED = `Run the formatter of the project (${FORMATTER_LABELS.join(', ')}) on the file; with no formatter, fix the layout by hand. ${NOT_YOUR_JAVA_FORMATTER}`;

const NO_ROUTE =
  'The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.';

function summaryOf(tool, rule) {
  return tool === 'spotbugs' ? wordsOfConstant(rule) : wordsOfCamelCase(rule);
}

function entryOf(tool, rule, { fix, layout, mayBeIntended }) {
  return ruleEntry({
    tool,
    rule,
    page: PAGES[tool],
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    summary: summaryOf(tool, rule),
    why: WHY[tool],
    ...(layout === true
      ? { allowed: LAYOUT_ALLOWED }
      : typeof fix === 'string'
        ? { allowed: fix }
        : {}),
    exception: {
      key: 'exceptions',
      rule: `${tool}/${rule}`,
      ...(mayBeIntended ? {} : { note: NO_ROUTE }),
    },
  });
}

/** The entries of the PMD, Checkstyle and SpotBugs rules that have a message catalog. */
export function catalogRuleEntries() {
  return CATALOG_TOOLS.flatMap((tool) =>
    Object.entries(readCatalog(tool)).map(([rule, fields]) => entryOf(tool, rule, fields)),
  );
}
