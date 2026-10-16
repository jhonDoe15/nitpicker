import { deadCodeMessage } from '../../exceptions/dead-code-messages.mjs';
import { evaluateBaselineExpansions } from '../../../../../shared/rules/baseline-expansion.mjs';
import { evaluateCoupling } from '../../../preset/coupling/evaluate-coupling.mjs';
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

const ENFORCED_DEAD_CODE_CATEGORIES = new Set(['files', 'exports', 'types']);

export function normalizeBaselineExpansions(baseSites, headSites, analyzerName) {
  return evaluateBaselineExpansions(baseSites, headSites, analyzerName);
}

export function normalizeCoupling(report, analyzerName, exceptions) {
  return evaluateCoupling(
    {
      ...report,
      modules: report.modules?.map(({ source, ...metrics }) => ({ file: source, ...metrics })),
    },
    analyzerName,
    exceptions,
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
  const occurrences = new Map();
  return [
    ...(report.files ?? []).flatMap((file) => unusedFileFindings(file, analyzerName)),
    ...(report.issues ?? []).flatMap((issue) =>
      issueFindings({ issue, analyzerName, occurrences }),
    ),
  ];
}

function unusedFileFindings(file, analyzerName) {
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
      message: deadCodeMessage('files', filePath),
      classification: 'enforceable',
    },
  ];
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
  const occurrence = nextOccurrence(occurrences, `${issue.file}\0${category}\0${name}`);
  const enforced = ENFORCED_DEAD_CODE_CATEGORIES.has(category);
  const sourceSuffix = enforced ? `|source:${entry?.sourceHash ?? hash(issue.file)}` : '';
  return [
    {
      tool: analyzerName,
      rule: category,
      path: issue.file,
      identity: `name:${name}|occurrence:${String(occurrence)}${sourceSuffix}`,
      message: deadCodeMessage(category, name, entry),
      symbol: name,
      classification: enforced ? 'enforceable' : 'descriptive',
      ...entryLocation(entry),
    },
  ];
}

function entryLocation(entry) {
  if (positiveInteger(entry?.line) === undefined) {
    return {};
  }
  return { location: { line: entry.line, column: positiveInteger(entry.col) ?? 1 } };
}
