import { readFileSync } from 'node:fs';
import { hasExceptionRoute } from '../../../shared/messages/exception-sentence.mjs';
import { definedField } from '../../../shared/messages/messages.mjs';
import { exceptionHint } from '../../../shared/rules/exceptions.mjs';
import { JAVA_FORMATTER_TOOLS, NOT_YOUR_JAVA_FORMATTER } from '../adapters/style/java-style.mts';
import { lazy } from '../../../shared/rules/finding-helpers.mjs';
import { SOURCE_RULE_IDS } from '../adapters/kotlin/rules/kotlin-rules.mts';

export type CatalogEntry = {
  readonly mayBeIntended: boolean;
  readonly fix?: string | undefined;
  readonly layout?: true;
};

export type RoutedFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly message: string;
  readonly classification: string;
} & Readonly<Record<string, unknown>>;

type RuleMessageOptions = {
  preset?: string | undefined;
  javaStyle?: string | undefined;
} & Readonly<Record<string, unknown>>;
type Catalog = Record<string, CatalogEntry>;
type FormRule = (sentence: string) => string | undefined;

const untypedLazy: <T>(read: () => T) => () => T = lazy;
const parseCatalog: (text: string) => Catalog = JSON.parse;
const untypedExceptionHint: (rule: string, path: string) => string = exceptionHint;
const untypedHasExceptionRoute: (message: string) => boolean = hasExceptionRoute;
const untypedDefinedField: (name: string, value: string | undefined) => Record<string, string> =
  definedField;

export const CATALOG_TOOLS = ['pmd', 'checkstyle', 'spotbugs'];
const catalogs = untypedLazy(
  () => new Map(CATALOG_TOOLS.map((tool): [string, Catalog] => [tool, readCatalog(tool)])),
);
const DETEKT = 'detekt';
const ROUTED = new Set([
  ...CATALOG_TOOLS,
  'javac',
  'forbiddenapis',
  'duplicates',
  'coupling/package-cycle',
  'coupling/test-only-export',
  'detekt',
  'dependencies',
  'spring',
]);
const CHECKSTYLE_CHECK =
  /^com\.puppycrawl\.tools\.checkstyle\.checks\.(?:\w+\.)*(\w+?)(?:Check)?(?:#(\w+))?$/u;
const SENTENCE_END = /[.!?;:]$/u;
const EXCLUDE_ROUTE = /to "exclude" in nitpicker\.config\.json\.$/u;
const FIRST_SENTENCE = /^.*?[.!?](?= |$)/u;
const leadingFormRules = untypedLazy(
  () =>
    new Map<string, FormRule>([
      ...rulesetNames('spring-ruleset.xml').map((name): [string, FormRule] => [
        name,
        (sentence) => sentence,
      ]),
      ...rulesetNames('spring-test-ruleset.xml').map((name): [string, FormRule] => [
        name,
        (sentence) => FIRST_SENTENCE.exec(sentence)?.[0] ?? sentence,
      ]),
    ]),
);

export function readCatalog(tool: string): Catalog {
  return parseCatalog(readFileSync(new URL(`./${tool}.json`, import.meta.url), 'utf8'));
}

function rulesetNames(file: string): string[] {
  const text = readFileSync(new URL(`../gradle/${file}`, import.meta.url), 'utf8');
  return [...text.matchAll(/<rule name="([A-Za-z]+)"/gu)].flatMap(([, name]) =>
    name === undefined ? [] : [name],
  );
}

export function checkstyleRuleName(source: string): string {
  const match = CHECKSTYLE_CHECK.exec(source);
  return match === null ? source : (match[2] ?? match[1] ?? source);
}

function layoutFix(javaStyle: string | undefined): string {
  if (javaStyle === 'none') {
    return 'Fix this layout by hand; no Java formatter runs.';
  }
  if (javaStyle === 'spring') {
    return "Format this file with Spring Java Format, the build's apply goal or format task; nitpicker does not run it.";
  }
  const formatter = JAVA_FORMATTER_TOOLS[javaStyle ?? '']?.label ?? 'your Java formatter';
  return `Run nitpicker --fix or ${formatter} on the file; either fixes this layout. ${NOT_YOUR_JAVA_FORMATTER}`;
}

export function withRuleMessage(
  finding: RoutedFinding,
  { preset = 'java', javaStyle }: RuleMessageOptions = {},
): RoutedFinding {
  if (!(ROUTED.has(finding.tool) || ROUTED.has(`${finding.tool}/${finding.rule}`))) {
    return finding;
  }
  const catalog: Catalog = catalogs().get(finding.tool) ?? {};
  const rule = finding.tool === 'checkstyle' ? checkstyleRuleName(finding.rule) : finding.rule;
  const entry = Object.hasOwn(catalog, rule) ? catalog[rule] : undefined;
  const exceptionRule = exceptionRuleFor({ ...finding, rule }, preset);
  const liftable =
    exceptionRule !== undefined &&
    finding.classification === 'enforceable' &&
    entry?.mayBeIntended !== false;
  return {
    ...finding,
    rule,
    ...ruleMessage({ ...finding, rule }, entry, { liftable, javaStyle, exceptionRule }),
  };
}

function exceptionRuleFor(finding: RoutedFinding, preset: string): string | undefined {
  const qualified = `${finding.tool}/${finding.rule}`;
  if (preset === 'kotlin') {
    if (finding.tool === DETEKT && SOURCE_RULE_IDS.includes(finding.rule)) {
      return finding.rule;
    }
    const javaSource = finding.path.endsWith('.java') && finding.tool !== DETEKT;
    return javaSource || qualified === 'coupling/test-only-export' ? qualified : undefined;
  }
  return preset === 'java' && finding.tool !== DETEKT ? qualified : undefined;
}

export function applyRuleMessages(
  findings: readonly RoutedFinding[],
  options?: RuleMessageOptions,
): RoutedFinding[] {
  return findings.map((finding) => withRuleMessage(finding, options));
}

function ruleMessage(
  finding: RoutedFinding,
  entry: CatalogEntry | undefined,
  {
    liftable,
    javaStyle,
    exceptionRule,
  }: { liftable: boolean; javaStyle: string | undefined; exceptionRule: string | undefined },
): { message: string; allowedForm?: string } {
  const message = finding.message.trim();
  if (untypedHasExceptionRoute(message) || EXCLUDE_ROUTE.test(message)) {
    return { message };
  }
  const fix = entry?.layout === true ? layoutFix(javaStyle) : entry?.fix;
  if (!(catalogs().has(finding.tool) || liftable)) {
    return { message: finding.message };
  }
  const sentence = SENTENCE_END.test(message) ? message : `${message}.`;
  return {
    message: [
      sentence,
      ...(typeof fix === 'string' ? [fix] : []),
      ...(liftable && exceptionRule !== undefined
        ? [untypedExceptionHint(exceptionRule, finding.path)]
        : []),
    ].join(' '),
    ...untypedDefinedField(
      'allowedForm',
      typeof fix === 'string' ? fix : leadingForm(finding, sentence),
    ),
  };
}

function leadingForm({ tool, rule }: RoutedFinding, sentence: string): string | undefined {
  return tool === 'pmd' ? leadingFormRules().get(rule)?.(sentence) : undefined;
}
