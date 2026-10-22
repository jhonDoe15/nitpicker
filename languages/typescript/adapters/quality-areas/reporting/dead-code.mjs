import { exceptionHint, isExcepted } from '../../../../../shared/hygiene/rules.mjs';
import { PACKAGE_RULE_IDS } from '../../../../../shared/project-rules/hygiene-rules.mjs';
import {
  hash,
  nextOccurrence,
  positiveInteger,
} from '../../../../../shared/rules/finding-helpers.mjs';

const DEAD_CODE_DECLARATIONS = new Map([
  ['exports', 'Export'],
  ['types', 'Exported type'],
]);
const DECLARATION_CATEGORIES = new Set(['files', 'exports', 'types']);
const PACKAGE_RULES = new Map([
  ['dependencies', PACKAGE_RULE_IDS.unusedDependency],
  ['devDependencies', PACKAGE_RULE_IDS.unusedDependency],
  ['unlisted', PACKAGE_RULE_IDS.unlistedDependency],
  ['unresolved', PACKAGE_RULE_IDS.unresolvedImport],
]);

export function normalizeDeadCode(report, analyzerName, { exceptions = [] } = {}) {
  const occurrences = new Map();
  return [
    ...(report.files ?? []).flatMap((file) => unusedFileFindings(file, analyzerName)),
    ...(report.issues ?? []).flatMap((issue) =>
      issueFindings({ issue, analyzerName, occurrences }),
    ),
  ]
    .filter(
      ({ finding, name }) =>
        !isExcepted(exceptions, {
          rule: finding.rule,
          path: finding.path,
          packageName: name,
          symbol: name,
        }),
    )
    .map(({ finding }) => finding);
}

function unusedFileFindings(file, analyzerName) {
  const filePath = typeof file === 'string' ? file : file?.path;
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return [];
  }
  const finding = {
    tool: analyzerName,
    rule: 'files',
    path: filePath,
    identity: `file:${filePath}|source:${file?.sourceHash ?? hash(filePath)}`,
    message: unusedFileMessage(filePath),
    classification: 'enforceable',
  };
  return [{ finding }];
}

function unusedFileMessage(filePath) {
  return `Unused file: ${filePath}. Nothing imports it: delete it, or import it where it is needed.`;
}

function issueFindings({ issue, analyzerName, occurrences }) {
  return Object.entries(issue)
    .filter(([category, entries]) => category !== 'file' && Array.isArray(entries))
    .flatMap(([category, entries]) =>
      entries.flatMap((entry) =>
        entryFindings({ issue, category, entry, analyzerName, occurrences }),
      ),
    );
}

function entryFindings({ issue, category, entry, analyzerName, occurrences }) {
  const name = typeof entry === 'string' ? entry : entry?.name;
  if (typeof name !== 'string' || name.length === 0) {
    return [];
  }
  const rule = PACKAGE_RULES.get(category) ?? category;
  const declaration = DECLARATION_CATEGORIES.has(category);
  const occurrence = nextOccurrence(occurrences, `${issue.file}\0${rule}\0${name}`);
  const sourceSuffix = declaration ? `|source:${entry?.sourceHash ?? hash(issue.file)}` : '';
  const finding = {
    tool: analyzerName,
    rule,
    path: issue.file,
    identity: `name:${name}|occurrence:${String(occurrence)}${sourceSuffix}`,
    message: deadCodeMessage({ category, name, entry, file: issue.file }),
    symbol: name,
    classification: declaration || PACKAGE_RULES.has(category) ? 'enforceable' : 'descriptive',
    ...entryLocation(entry),
  };
  return [{ name, finding }];
}

function entryLocation(entry) {
  if (positiveInteger(entry?.line) === undefined) {
    return {};
  }
  return { location: { line: entry.line, column: positiveInteger(entry.col) ?? 1 } };
}

function deadCodeMessage({ category, name, entry, file }) {
  const rule = PACKAGE_RULES.get(category);
  if (rule !== undefined) {
    return `${packageMessage(rule, name, file)} ${exceptionHint(rule, file, name)}`;
  }
  if (category === 'files') {
    return unusedFileMessage(name);
  }
  const kind = DEAD_CODE_DECLARATIONS.get(category);
  if (kind === undefined) {
    return `${category}: ${name}`;
  }
  return entry?.usedInFile === true
    ? `${kind} ${name} is only used in its own file. Remove \`export\`.`
    : `${kind} ${name} is never imported. Remove \`export\`, or the ${category === 'types' ? 'type' : 'declaration'} if nothing uses it.`;
}

function packageMessage(rule, name, file) {
  if (rule === PACKAGE_RULE_IDS.unusedDependency) {
    return `Unused dependency ${name}: nothing imports or runs it. Remove it from ${file}.`;
  }
  if (rule === PACKAGE_RULE_IDS.unlistedDependency) {
    return `Package ${name} is imported but not listed in package.json. Add it to dependencies (devDependencies for tests and tooling).`;
  }
  return `Import ${name} resolves to no file or package. Fix the path, or install the package and list it in package.json.`;
}
