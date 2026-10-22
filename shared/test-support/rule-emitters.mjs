import { readdirSync } from 'node:fs';
import path from 'node:path';
import { importClosure } from '../import-closure.mjs';
import {
  ENFORCED_MUTATION_STATUSES,
  FUNCTION_STRUCTURE_LIMITS,
  RULES,
  RULE_IDS,
  mutantRuleId,
} from '../policy.mjs';
import { HYGIENE_RULE_IDS, PACKAGE_RULE_IDS } from '../project-rules/hygiene-rules.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const IGNORED_FOLDERS = new Set(['fixtures', 'test-support', '__tests__', 'e2e', '__pycache__']);
const SOURCE_FILE = /\.(?:[cm]?js|py|java|kt|kts|gradle)$/u;
const TEST_FILE = /\.test\.[cm]?js$/u;
const KOTLIN_FILE = /kotlin/iu;
const NON_EMITTING_FILES = [
  /^shared\/policy\.mjs$/u,
  /^shared\/checks-catalog\.mjs$/u,
  /^shared\/project-rules\//u,
  /^shared\/config\.mjs$/u,
  /^shared\/messages\//u,
  /^shared\/exceptions\//u,
  /^shared\/unused-api\/unused-api-policy\.mjs$/u,
];
const ID_TABLES = [RULE_IDS, HYGIENE_RULE_IDS, PACKAGE_RULE_IDS];
const RULES_BUILT_FROM = new Map([
  ...Object.values(FUNCTION_STRUCTURE_LIMITS).map(({ ruleId }) => [
    ruleId,
    'FUNCTION_STRUCTURE_LIMITS',
  ]),
  ...ENFORCED_MUTATION_STATUSES.map((status) => [mutantRuleId(status), 'mutantRuleId']),
]);

const LANGUAGE_SOURCES = {
  typescript: ['languages/typescript'],
  javascript: ['languages/javascript'],
  python: ['languages/python'],
  java: ['languages/java'],
  kotlin: ['languages/java'],
};
const EVERY_LANGUAGE_SOURCES = ['shared/hygiene'];

function sourceFiles(directories) {
  const found = [];
  const pending = [...directories];
  for (const directory of pending) {
    const absolute = path.resolve(repositoryRoot, directory);
    if (!absolute.startsWith(`${repositoryRoot}${path.sep}`)) {
      throw new Error(`${directory} is outside the repository`);
    }
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        pending.push(...(IGNORED_FOLDERS.has(entry.name) ? [] : [relative]));
      } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
        found.push(relative);
      }
    }
  }
  return found;
}

function needlesOf(ruleId) {
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

const NEEDLES = new Map(RULES.map(({ id }) => [id, needlesOf(id)]));

function emittingFiles(language) {
  const entries = sourceFiles([...LANGUAGE_SOURCES[language], ...EVERY_LANGUAGE_SOURCES]);
  return importClosure(entries, repositoryRoot);
}

function scanLanguage(language) {
  const files = [...emittingFiles(language)]
    .filter(([file]) => !NON_EMITTING_FILES.some((pattern) => pattern.test(file)))
    .filter(([file]) => language !== 'java' || !KOTLIN_FILE.test(file));
  return new Map(
    RULES.map(({ id }) => [
      id,
      files
        .filter(([, text]) => NEEDLES.get(id).test(text))
        .map(([file]) => file)
        .sort(),
    ]),
  );
}

export function ruleEmitters(language) {
  const scanned = scanLanguage(language);
  if (language !== 'javascript') {
    return scanned;
  }
  const typescript = scanLanguage('typescript');
  return new Map([...scanned].map(([id, files]) => [id, [...files, ...typescript.get(id)]]));
}
