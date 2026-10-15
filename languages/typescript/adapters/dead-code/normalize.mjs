import { PACKAGE_RULE_IDS, exceptionHint, isExcepted } from '../../../../shared/hygiene/rules.mjs';
import {
  hash,
  nextOccurrence,
  positiveInteger,
} from '../../../../shared/rules/finding-helpers.mjs';

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
  const findings = [
    ...(report.files ?? []).flatMap((file) => unusedFileFinding(file, analyzerName)),
    ...(report.issues ?? []).flatMap((issue) =>
      Object.entries(issue).flatMap(([category, entries]) =>
        category === 'file' || !Array.isArray(entries)
          ? []
          : entries.flatMap((entry) =>
              entryFinding({ issue, category, entry, analyzerName, occurrences }),
            ),
      ),
    ),
  ];
  return findings.filter((finding) => !isExcepted(exceptions, finding.rule, finding.path));
}

function unusedFileFinding(file, analyzerName) {
  const filePath = typeof file === 'string' ? file : file?.path;
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return [];
  }
  return [
    {
      tool: analyzerName,
      rule: 'files',
      path: filePath,
      identity: `file:${filePath}|source:${file?.sourceHash ?? hash(filePath)}`,
      message: unusedFileMessage(filePath),
      classification: 'enforceable',
    },
  ];
}

function unusedFileMessage(filePath) {
  return `Unused file: ${filePath}. Nothing imports it: delete it, or import it where it is needed.`;
}

function entryFinding({ issue, category, entry, analyzerName, occurrences }) {
  const name = typeof entry === 'string' ? entry : entry?.name;
  if (typeof name !== 'string' || name.length === 0) {
    return [];
  }
  const rule = PACKAGE_RULES.get(category) ?? category;
  const enforced = DECLARATION_CATEGORIES.has(category) || PACKAGE_RULES.has(category);
  const occurrence = nextOccurrence(occurrences, `${issue.file}\0${rule}\0${name}`);
  return [
    {
      tool: analyzerName,
      rule,
      path: issue.file,
      identity: `name:${name}|occurrence:${String(occurrence)}${
        DECLARATION_CATEGORIES.has(category)
          ? `|source:${entry?.sourceHash ?? hash(issue.file)}`
          : ''
      }`,
      message: deadCodeMessage({ category, name, entry, file: issue.file }),
      classification: enforced ? 'enforceable' : 'descriptive',
      ...(positiveInteger(entry?.line) === undefined
        ? {}
        : { location: { line: entry.line, column: positiveInteger(entry.col) ?? 1 } }),
    },
  ];
}

function deadCodeMessage({ category, name, entry, file }) {
  const rule = PACKAGE_RULES.get(category);
  if (rule !== undefined) {
    return `${packageMessage(rule, name, file)} ${exceptionHint(rule, file)}`;
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
