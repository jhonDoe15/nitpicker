import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../../../../shared/glob.mjs';

const GENERATED_FILE_GLOBS = [
  '**/*.generated.ts',
  '**/*.generated.tsx',
  '**/*.gen.ts',
  '**/*.gen.tsx',
  '**/*Generated.ts',
  '**/*Generated.tsx',
  '**/*_grpc_pb.ts',
  '**/*_pb.ts',
  '**/*.pb.ts',
  '**/*.ngfactory.ts',
  '**/*.ngsummary.ts',
  '**/*.ngtypecheck.ts',
].map((glob) => ({ source: 'default', kind: 'path', rule: glob, pattern: globToRegExp(glob) }));

const GENERATED_MARKERS = [
  '@generated',
  '@auto-generated',
  'AUTO-GENERATED',
  'This file was generated',
  'This file is generated',
  'Do not edit',
  'DO NOT EDIT',
];

const OUTPUT_SEGMENTS = new Set(['build', 'out', 'target']);
const EXCLUDED_SEGMENTS = [
  '__tests__',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.vite',
  'dist',
  'coverage',
  'node_modules',
];

function isTestFileName(file) {
  const baseName = path.basename(file).toLowerCase();
  return baseName.includes('.test.') || baseName.includes('.spec.');
}

function isCompiledSourceRoot(directories) {
  return directories.some(
    (segment, index) =>
      OUTPUT_SEGMENTS.has(segment) &&
      directories[index + 1] === 'src' &&
      !directories.slice(0, index).includes('src'),
  );
}

function isAnalyzable(relative, extensions) {
  const lowered = relative.toLowerCase();
  const directories = lowered.split('/').slice(0, -1);
  return (
    extensions.some((extension) => lowered.endsWith(`.${extension}`)) &&
    !lowered.endsWith('.d.ts') &&
    !isTestFileName(lowered) &&
    !isCompiledSourceRoot(directories) &&
    !directories.some((segment) => EXCLUDED_SEGMENTS.includes(segment))
  );
}

function userGlobRule(glob) {
  const normalized = glob.replaceAll('\\', '/').replace(/^\.\//u, '');
  const pattern = globToRegExp(normalized.includes('/') ? normalized : `**/${normalized}`);
  return { source: 'user', kind: 'path', rule: glob, pattern };
}

function generatedDirectoryRule(relative) {
  for (const segment of relative.split('/').slice(0, -1)) {
    const lowered = segment.toLowerCase();
    if (lowered.includes('generated')) {
      return { source: 'default', kind: 'path', rule: 'directory segment contains generated' };
    }
    if (lowered === 'gen') {
      return { source: 'default', kind: 'path', rule: 'directory segment is gen' };
    }
  }
  return undefined;
}

const LEADING_COMMENTS = /^(?:\s*(?:(?:#!|\/\/)[^\n]*|\/\*[\s\S]*?(?:\*\/|$)))*/u;

function leadingCommentHeader(text) {
  return LEADING_COMMENTS.exec(text)?.[0] ?? '';
}

function exclusionReason(file, relative, userRules) {
  const rule =
    generatedDirectoryRule(relative) ??
    [...GENERATED_FILE_GLOBS, ...userRules].find(({ pattern }) => pattern.test(relative));
  if (rule) {
    return rule;
  }
  const header = leadingCommentHeader(readFileSync(file, 'utf8'));
  const marker = GENERATED_MARKERS.find((candidate) => header.includes(candidate));
  return marker ? { source: 'default', kind: 'generatedMarker', rule: marker } : undefined;
}

function auditOf(candidates, included, reasons) {
  return {
    candidateFiles: candidates,
    includedFiles: included,
    excludedFiles: candidates - included,
    reasons: [...reasons.values()].sort(
      (left, right) =>
        left.source.localeCompare(right.source) ||
        left.kind.localeCompare(right.kind) ||
        left.rule.localeCompare(right.rule),
    ),
  };
}

function relativeOf(projectRoot, file) {
  return path.relative(projectRoot, file).replaceAll('\\', '/');
}

export function selectSourceFiles(projectRoot, files, { extensions, excludes }) {
  const userRules = excludes.map(userGlobRule);
  const reasons = new Map();
  const selected = [];
  const candidates = [...new Set(files.map((file) => path.resolve(projectRoot, file)))]
    .sort()
    .filter((file) => isAnalyzable(relativeOf(projectRoot, file), extensions));
  for (const file of candidates) {
    const reason = exclusionReason(file, relativeOf(projectRoot, file), userRules);
    if (reason === undefined) {
      selected.push(file);
      continue;
    }
    const key = `${reason.source}\0${reason.kind}\0${reason.rule}`;
    reasons.set(key, {
      source: reason.source,
      kind: reason.kind,
      rule: reason.rule,
      count: (reasons.get(key)?.count ?? 0) + 1,
    });
  }
  return { files: selected, audit: auditOf(candidates.length, selected.length, reasons) };
}
