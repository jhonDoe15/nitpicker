import {
  declarationLine,
  hash,
  nameFreeHash,
  positiveInteger,
} from '../../../../../shared/rules/finding-helpers.mjs';
import { functionIdentity } from '../../exceptions/function-identity.mjs';
import { readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_CASE = 'the default case';
const DEFAULT_CLAUSE = /^default\b/u;
const NEVER_ANNOTATION = /^default\s*:[\s\S]*?:\s*never\b/u;
const UNION_DEFAULT_HINT =
  ' (a switch that lists every member of a union needs no default: switch-exhaustiveness-check proves it complete)';
const VALUE_DEFAULT_HINT = ' (pass a value that no case lists)';

export function withFunctionSourceHashes(report, projectRoot) {
  const sourceTexts = new Map();
  const identities = new Map();
  return {
    ...report,
    functions: (report.functions ?? []).map((entry) => {
      let source = sourceTexts.get(entry.source);
      if (source === undefined) {
        source = readProjectSource(projectRoot, entry.source);
        sourceTexts.set(entry.source, source);
        identities.set(entry.source, functionIdentity(source, entry.source));
      }
      const name = identities.get(entry.source).crapFunctionName(entry) ?? entry.function;
      const text = sourceLineRange(
        source,
        entry.start ?? entry.lines?.start,
        entry.end ?? entry.lines?.end,
      );
      return {
        ...entry,
        function: name,
        sourceHash: hash(text),
        ...(text === ''
          ? {}
          : { anchorHash: nameFreeHash(text, name), declarationHash: hash(declarationLine(text)) }),
      };
    }),
  };
}

export function withBranchSourceHashes(report, projectRoot) {
  return Object.fromEntries(
    Object.entries(report).map(([absolutePath, coverage]) => {
      const source = readProjectSource(projectRoot, absolutePath);
      const branchSourceHashes = Object.fromEntries(
        Object.entries(coverage.branchMap ?? {}).map(([branchId, branch]) => [
          branchId,
          hash(
            JSON.stringify({
              type: branch.type,
              source: sourceLocation(source, branch.loc),
              outcomes: (branch.locations ?? []).map((location) =>
                sourceLocation(source, location),
              ),
            }),
          ),
        ]),
      );
      const uncoveredArms = Object.fromEntries(
        Object.entries(coverage.branchMap ?? {}).map(([branchId, branch]) => [
          branchId,
          describeUncoveredArms(branch, coverage.b?.[branchId], source),
        ]),
      );
      const branchFunctions = functionIdentity(source, absolutePath).branchFunctionNames(
        coverage.branchMap,
      );
      return [absolutePath, { ...coverage, branchSourceHashes, uncoveredArms, branchFunctions }];
    }),
  );
}

export function describeUncoveredArms(branch, hits, source) {
  const locations = branch.locations ?? [];
  return (hits ?? []).flatMap((count, index) => {
    if (count > 0) {
      return [];
    }
    const name = armName(branch, index, source);
    const hint = name === DEFAULT_CASE ? defaultHint(branch, locations[index], source) : '';
    return [`${name} at ${armPosition(locations[index], branch)}${hint}`];
  });
}

function defaultHint(branch, location, source) {
  const end = location?.end ?? branch.loc?.end;
  if (location?.start === undefined || end === undefined) {
    return VALUE_DEFAULT_HINT;
  }
  const clause = source.slice(offsetOf(source, location.start), offsetOf(source, end));
  return NEVER_ANNOTATION.test(clause) ? UNION_DEFAULT_HINT : VALUE_DEFAULT_HINT;
}

function armPosition(location, branch) {
  const start = Number.isInteger(location?.start?.line) ? location.start : branch.loc?.start;
  return `${String(start?.line ?? '?')}:${String((start?.column ?? 0) + 1)}`;
}

function armName(branch, index, source) {
  switch (branch.type) {
    case 'if':
      return index === 0 ? 'the true arm of the if' : 'the false arm of the if (or its else)';
    case 'cond-expr':
      return index === 0 ? 'the true arm of the ?:' : 'the false arm of the ?:';
    case 'binary-expr':
      return `the ${index === 0 ? 'left' : 'right'} side of ${logicalOperator(branch, source)}`;
    case 'switch':
      return startsWith(source, branch.locations?.[index], DEFAULT_CLAUSE)
        ? DEFAULT_CASE
        : 'a switch case';
    case 'default-arg':
      return 'the default value';
    default:
      return 'a branch arm';
  }
}

function logicalOperator(branch, source) {
  const [first, second] = branch.locations ?? [];
  if (first?.start === undefined || second?.start === undefined) {
    return 'the logical expression';
  }
  const between = source.slice(offsetOf(source, first.start), offsetOf(source, second.start));
  return /\?\?|&&|\|\|/u.exec(between)?.[0] ?? 'the logical expression';
}

function startsWith(source, location, pattern) {
  return (
    location?.start !== undefined && pattern.test(source.slice(offsetOf(source, location.start)))
  );
}

function offsetOf(source, { line, column }) {
  const precedingLines = source.split('\n').slice(0, line - 1);
  return precedingLines.reduce((total, text) => total + text.length + 1, 0) + (column ?? 0);
}

export function withDeadCodeSourceHashes(report, projectRoot) {
  return {
    ...report,
    files: (report.files ?? []).map((file) => ({
      path: file,
      sourceHash: hash(readProjectSource(projectRoot, file)),
    })),
    issues: (report.issues ?? []).map((issue) => {
      const lines = readProjectSource(projectRoot, issue.file).split('\n');
      return Object.fromEntries(
        Object.entries(issue).map(([category, entries]) => [
          category,
          Array.isArray(entries)
            ? entries.map((entry) => withDeclarationSourceHash(entry, lines))
            : entries,
        ]),
      );
    }),
  };
}

function withDeclarationSourceHash(entry, lines) {
  const line = positiveInteger(entry?.line);
  if (typeof entry !== 'object' || line === undefined || line > lines.length) {
    return entry;
  }
  return {
    ...entry,
    sourceHash: hash(lines[line - 1].trim()),
    usedInFile: isUsedBesidesDeclaration(entry.name, lines, line),
  };
}

function isUsedBesidesDeclaration(name, lines, declarationLine) {
  if (typeof name !== 'string' || name.length === 0) {
    return false;
  }
  const word = new RegExp(`(?<![\\w$])${name.replaceAll('$', String.raw`\$`)}(?![\\w$])`, 'u');
  return lines.some((text, index) => index !== declarationLine - 1 && word.test(text));
}

export function withMutationSourceHashes(report, projectRoot) {
  return {
    ...report,
    files: Object.fromEntries(
      Object.entries(report.files ?? {}).map(([filePath, file]) => {
        const source = readProjectSource(projectRoot, filePath);
        const identity = functionIdentity(source, filePath);
        return [
          filePath,
          {
            ...file,
            mutants: (file.mutants ?? []).map((mutant) => ({
              ...mutant,
              sourceHash: hash(sourceLocation(source, mutant.location)),
              original: sourceSnippet(source, mutant.location),
              functionName: identity.functionNameAtLine(mutant.location?.start?.line),
            })),
          },
        ];
      }),
    ),
  };
}

function readProjectSource(projectRoot, relativePath) {
  return readFileSync(
    path.join(projectRoot, relativeProjectFile(projectRoot, relativePath)),
    'utf8',
  );
}

function relativeProjectFile(projectRoot, filePath) {
  const absolutePath = path.resolve(projectRoot, filePath);
  const relativePath = path.relative(projectRoot, absolutePath);
  if (
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath) ||
    !lstatSync(absolutePath).isFile()
  ) {
    throw new Error(`Analyzer source path must stay within the project: ${filePath}`);
  }
  return relativePath;
}

function sourceLocation(source, location) {
  return sourceLineRange(source, location?.start?.line, location?.end?.line);
}

export function sourceSnippet(source, location) {
  const start = location?.start;
  const end = location?.end;
  if (!Number.isInteger(start?.line) || !Number.isInteger(end?.line)) {
    return undefined;
  }
  const lines = source.split(/\r?\n/);
  const first = lines[start.line - 1];
  const last = lines[end.line - 1];
  if (first === undefined || last === undefined) {
    return undefined;
  }
  return start.line === end.line
    ? first.slice(start.column - 1, end.column - 1)
    : [
        first.slice(start.column - 1),
        ...lines.slice(start.line, end.line - 1),
        last.slice(0, end.column - 1),
      ].join('\n');
}

function sourceLineRange(source, startLine, endLine) {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || endLine < startLine) {
    return '';
  }
  return source
    .split(/\r?\n/)
    .slice(startLine - 1, endLine)
    .join('\n');
}
