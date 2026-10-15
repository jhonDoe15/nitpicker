import { evaluateBaselineExpansions } from '../../../../../shared/rules/baseline-expansion.mjs';
import { evaluateCoupling } from '../../../../../shared/rules/coupling.mjs';
import { evaluateTestRuntime } from '../../../../../shared/rules/test-runtime.mjs';
import { evaluateStructure } from '../../../../../shared/rules/structure.mjs';
import {
  hash,
  nextOccurrence,
  positiveInteger,
} from '../../../../../shared/rules/finding-helpers.mjs';

const STRUCTURE_HINTS = {
  lines:
    'Nested functions count: move inner functions to module level, passing what they close over as one object.',
};

const DEAD_CODE_DECLARATIONS = new Map([
  ['exports', 'Export'],
  ['types', 'Exported type'],
]);

const ENFORCED_DEAD_CODE_CATEGORIES = new Set(['files', 'exports', 'types']);

export function normalizeBaselineExpansions(baseSites, headSites, analyzerName) {
  return evaluateBaselineExpansions(baseSites, headSites, analyzerName);
}

export function normalizeCoupling(report, analyzerName) {
  return evaluateCoupling(
    {
      ...report,
      modules: report.modules?.map(({ source, ...metrics }) => ({ file: source, ...metrics })),
    },
    analyzerName,
  );
}

export function normalizeTestRuntime(report, analyzerName) {
  return evaluateTestRuntime(report, analyzerName);
}

export function normalizeStructure(report, analyzerName) {
  return evaluateStructure(
    {
      ...report,
      functions: report.functions?.map(({ source, function: name, ...metrics }) => ({
        file: source,
        name,
        ...metrics,
      })),
      classes: report.classes?.map(({ source, class: name, ...metrics }) => ({
        file: source,
        name,
        ...metrics,
      })),
    },
    analyzerName,
    { hints: STRUCTURE_HINTS },
  );
}

export function normalizeDeadCode(report, analyzerName) {
  const findings = [];
  const occurrences = new Map();
  for (const file of report.files ?? []) {
    const filePath = typeof file === 'string' ? file : file?.path;
    if (typeof filePath !== 'string' || filePath.length === 0) {
      continue;
    }
    findings.push({
      tool: analyzerName,
      rule: 'files',
      path: filePath,
      identity: `file:${filePath}|source:${file?.sourceHash ?? hash(filePath)}`,
      message: `Unused file: ${filePath}. Nothing imports it: delete it, or import it where it is needed.`,
      classification: 'enforceable',
    });
  }
  for (const issue of report.issues ?? []) {
    for (const [category, entries] of Object.entries(issue)) {
      if (category === 'file' || !Array.isArray(entries)) {
        continue;
      }
      for (const entry of entries) {
        const name = typeof entry === 'string' ? entry : entry?.name;
        if (typeof name !== 'string' || name.length === 0) {
          continue;
        }
        const key = `${issue.file}\0${category}\0${name}`;
        const occurrence = nextOccurrence(occurrences, key);
        findings.push({
          tool: analyzerName,
          rule: category,
          path: issue.file,
          identity: `name:${name}|occurrence:${String(occurrence)}${
            ENFORCED_DEAD_CODE_CATEGORIES.has(category)
              ? `|source:${entry?.sourceHash ?? hash(issue.file)}`
              : ''
          }`,
          message: deadCodeMessage(category, name, entry),
          classification: ENFORCED_DEAD_CODE_CATEGORIES.has(category)
            ? 'enforceable'
            : 'descriptive',
          ...(positiveInteger(entry?.line) === undefined
            ? {}
            : {
                location: {
                  line: entry.line,
                  column: positiveInteger(entry.col) ?? 1,
                },
              }),
        });
      }
    }
  }
  return findings;
}

function deadCodeMessage(category, name, entry) {
  const kind = DEAD_CODE_DECLARATIONS.get(category);
  if (kind === undefined) {
    return `${category}: ${name}`;
  }
  return entry?.usedInFile === true
    ? `${kind} ${name} is only used in its own file. Remove \`export\`.`
    : `${kind} ${name} is never imported. Remove \`export\`, or the ${category === 'types' ? 'type' : 'declaration'} if nothing uses it.`;
}
