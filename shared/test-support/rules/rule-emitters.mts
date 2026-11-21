import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { importClosure, importedFiles } from '../../import-closure.mts';
import { escapeRegExp } from '../../paths/glob.mts';
import {
  ENFORCED_MUTATION_STATUSES,
  FUNCTION_STRUCTURE_LIMITS,
  RULES,
  RULE_IDS,
  mutantRuleId,
} from '../../policy.mts';
import { DESIGN_RULES } from '../../project-rules/design/design-rules.mts';
import { HYGIENE_RULE_IDS, PACKAGE_RULE_IDS } from '../../project-rules/hygiene-rules.mts';
import { byText } from '../../text-order/by-text.mts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const IGNORED_FOLDERS = new Set(['fixtures', 'test-support', '__tests__', 'e2e', '__pycache__']);
const SOURCE_FILE = /\.(?:[cm]?js|mts|py|java|kt|kts|gradle)$/u;
const TEST_FILE = /\.test\.(?:[cm]?js|mts)$/u;
const KOTLIN_FILE = /kotlin/iu;
const PYTHON_FILE = /\.py$/u;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//gu;
const LINE_COMMENT = /(^|[^:])\/\/[^\n]*/gmu;
const HASH_COMMENT = /#[^\n]*/gu;
const CATALOG_FILES: readonly string[] = [
  'shared/policy.mts',
  'shared/project-rules/fact-rules.mts',
  'shared/project-rules/hygiene-rules.mts',
  'shared/project-rules/reuse-rules.mts',
  'shared/project-rules/size-rules.mts',
  'shared/project-rules/source-rules.mts',
  'shared/project-rules/test-runtime-rules.mts',
  'shared/unused-api/unused-api-policy.mts',
];
const NON_EMITTING_FILES: readonly RegExp[] = [
  /^shared\/policy\.mts$/u,
  /^shared\/checks-catalog\.mts$/u,
  /^shared\/project-rules\//u,
  /^shared\/config\.mts$/u,
  /^shared\/messages\//u,
  /^shared\/exceptions\//u,
  /^shared\/unused-api\/unused-api-policy\.mts$/u,
];
const ID_TABLES: readonly Readonly<Record<string, string>>[] = [
  RULE_IDS,
  HYGIENE_RULE_IDS,
  PACKAGE_RULE_IDS,
];
const RULES_BUILT_FROM = new Map<string, string>([
  ...Object.values(FUNCTION_STRUCTURE_LIMITS).map(({ ruleId }): [string, string] => [
    ruleId,
    'FUNCTION_STRUCTURE_LIMITS',
  ]),
  ...ENFORCED_MUTATION_STATUSES.map((status): [string, string] => [
    mutantRuleId(status),
    'mutantRuleId',
  ]),
  [RULE_IDS.shorterCondition, 'shorter-boolean-logic'],
  [PACKAGE_RULE_IDS.unusedDependency, 'unused-declared-dependency'],
  [RULE_IDS.featureInternalImport, 'feature-internals-only-through-index'],
  [RULE_IDS.sharedImportsFeature, 'shared-does-not-import-features'],
  [RULE_IDS.featureCycle, 'no-production-cycles'],
  [RULE_IDS.domainImportsAdapter, 'domain-does-not-import-adapters|io-in-domain'],
  [RULE_IDS.domainImportsIo, 'domain-does-not-import-node-io|io-in-domain'],
  [RULE_IDS.domainImportsClient, 'domain-does-not-import-network-or-database-clients|io-in-domain'],
  [RULE_IDS.domainImportsLogger, 'domain-does-not-import-the-logger|logger-in-domain'],
  [RULE_IDS.domainImportsRandom, 'domain-does-not-import-id-libraries|random-in-domain'],
  [RULE_IDS.domainReachesIo, 'domain-does-not-reach-io-through-shared|helper-chain'],
]);

const LANGUAGE_SOURCES: Readonly<Record<string, readonly string[]>> = {
  typescript: ['languages/typescript'],
  javascript: ['languages/javascript'],
  python: ['languages/python'],
  java: ['languages/java'],
  kotlin: ['languages/java'],
  go: ['languages/go'],
};
const EVERY_LANGUAGE_SOURCES: readonly string[] = ['shared/hygiene', 'shared/history'];
const FACT_EVALUATOR = 'shared/rules/facts/evaluate.mts';
const SHARED_RULE_LISTS: Readonly<Record<string, readonly (string | undefined)[] | undefined>> = {
  DESIGN_RULES,
};
const RULE_ID_TABLE: Readonly<Record<string, string | undefined>> = RULE_IDS;
const RULES_ARGUMENT = /\brules:\s*(?:([A-Z][A-Z_]*)\b|\[([^\]]*)\])/gu;
const RULE_ID_REFERENCE = /\bRULE_IDS\.([A-Za-z]+)\b/gu;
const LANGUAGE_ARGUMENT = /\blanguage:\s*'([a-z]+)'/gu;
const QUOTED_RULE = /'([a-z][a-z-]*)'/gu;

type RuleList = readonly (string | undefined)[];
type CallSite = { readonly file: string; readonly rules: RuleList | undefined };
type Scanned = Map<string, string[]>;

function repositoryFile(relative: string): string {
  const absolute = path.resolve(repositoryRoot, relative);
  if (!absolute.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error(`${relative} is outside the repository`);
  }
  return absolute;
}

function sourceFiles(directories: readonly string[]): string[] {
  const found: string[] = [];
  const pending = [...directories];
  for (const directory of pending) {
    for (const entry of readdirSync(repositoryFile(directory), { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!IGNORED_FOLDERS.has(entry.name)) {
          pending.push(relative);
        }
      } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
        found.push(relative);
      }
    }
  }
  return found;
}

function needlesOf(ruleId: string): RegExp {
  const keys = ID_TABLES.flatMap((table) =>
    Object.entries(table)
      .filter(([, id]) => id === ruleId)
      .map(([key]) => key),
  );
  const built = RULES_BUILT_FROM.get(ruleId);
  return new RegExp(
    [ruleId, ...keys.map((key) => `\\b${key}\\b`), ...(built === undefined ? [] : [built])].join(
      '|',
    ),
    'u',
  );
}

const NEEDLES = new Map(RULES.map(({ id }): [string, RegExp] => [id, needlesOf(id)]));

function needleOf(ruleId: string): RegExp {
  const needle = NEEDLES.get(ruleId);
  if (needle === undefined) {
    throw new Error(`${ruleId} is not a catalogued rule`);
  }
  return needle;
}

function rulesInList(list: string): RuleList {
  return [
    ...[...list.matchAll(QUOTED_RULE)].map((match) => match[1]),
    ...[...list.matchAll(RULE_ID_REFERENCE)].map((match) => RULE_ID_TABLE[match[1] ?? '']),
  ];
}

function listedRules(
  text: string,
  name: string | undefined,
  inline: string | undefined,
): RuleList | undefined {
  if (inline !== undefined) {
    return rulesInList(inline);
  }
  const local = new RegExp(`\\bconst ${escapeRegExp(name ?? '')} = \\[([^\\]]*)\\]`, 'u').exec(
    text,
  );
  return local === null ? SHARED_RULE_LISTS[name ?? ''] : rulesInList(local[1] ?? '');
}

function callSiteRules(text: string, language: string): RuleList | undefined {
  const languages = [...text.matchAll(LANGUAGE_ARGUMENT)].map((match) => match[1]);
  if (languages.length > 0 && !languages.includes(language)) {
    return [];
  }
  const lists = [...text.matchAll(RULES_ARGUMENT)].map((match) =>
    listedRules(text, match[1], match[2]),
  );
  return lists.length === 0 || lists.includes(undefined) ? undefined : lists.flat();
}

function evaluatorCallSites(direct: ReadonlyMap<string, string>, language: string): CallSite[] {
  return [...direct]
    .filter(([file, text]) => importedFiles(file, text, repositoryRoot).includes(FACT_EVALUATOR))
    .map(([file, text]) => ({ file, rules: callSiteRules(withoutComments(file, text), language) }));
}

function emittingFiles(language: string): {
  readonly files: Map<string, string>;
  readonly callSites: CallSite[];
} {
  const entries = sourceFiles([...(LANGUAGE_SOURCES[language] ?? []), ...EVERY_LANGUAGE_SOURCES]);
  const stopAt = new Set([FACT_EVALUATOR]);
  const direct = importClosure(entries, repositoryRoot, { stopAt });
  const callSites = evaluatorCallSites(direct, language);
  if (callSites.some(({ rules }) => rules === undefined)) {
    return { files: importClosure(entries, repositoryRoot), callSites: [] };
  }
  direct.delete(FACT_EVALUATOR);
  return { files: direct, callSites };
}

function withoutComments(file: string, text: string): string {
  return PYTHON_FILE.test(file)
    ? text.replace(HASH_COMMENT, '')
    : text.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, (_match, prefix: string) => prefix);
}

export function mentionsRule(file: string, text: string, ruleId: string): boolean {
  return needleOf(ruleId).test(withoutComments(file, text));
}

export function isKotlinPath(file: string): boolean {
  return KOTLIN_FILE.test(file);
}

export function catalogFileOf(ruleId: string): string {
  const needle = needleOf(ruleId);
  return (
    CATALOG_FILES.find((file) => needle.test(readFileSync(repositoryFile(file), 'utf8'))) ??
    'shared/policy.mts'
  );
}

function scanLanguage(language: string): Scanned {
  const { files: closure, callSites } = emittingFiles(language);
  const files = [...closure]
    .filter(([file]) => !NON_EMITTING_FILES.some((pattern) => pattern.test(file)))
    .filter(([file]) => language !== 'java' || !KOTLIN_FILE.test(file))
    .map(([file, text]): [string, string] => [file, withoutComments(file, text)]);
  function emitters(id: string): string[] {
    const mentioning = files.filter(([, text]) => needleOf(id).test(text)).map(([file]) => file);
    const calling = callSites
      .filter(({ rules }) => rules?.includes(id) === true)
      .map(({ file }) => file);
    return [...new Set([...mentioning, ...calling])].sort(byText);
  }
  return new Map(RULES.map(({ id }): [string, string[]] => [id, emitters(id)]));
}

export function ruleEmitters(language: string): Scanned {
  const scanned = scanLanguage(language);
  if (language !== 'javascript') {
    return scanned;
  }
  const typescript = scanLanguage('typescript');
  return new Map(
    [...scanned].map(([id, files]): [string, string[]] => [
      id,
      [...files, ...(typescript.get(id) ?? [])],
    ]),
  );
}
