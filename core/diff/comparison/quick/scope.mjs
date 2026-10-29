import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { globMatcher } from '../../../../shared/paths/glob.mjs';

const FILE_LOCAL_ANALYZERS = new Set([
  'prettier-format',
  'eslint-errors',
  'eslint-logging',
  'eslint-module-effects',
]);
const GLOB_SPECIAL = /[*?[\]{}()!\\]/gu;
const EMPTY_REPORT_SCRIPT = String.raw`process.stdout.write(JSON.stringify({ findings: [] }) + '\n');`;

function scopeHash(configurationHash, digest) {
  return createHash('sha256').update(`${configurationHash}\0scope\0${digest}`).digest('hex');
}

function patternsOf(args) {
  return args.flatMap((argument, index) => (args[index - 1] === '--pattern' ? [argument] : []));
}

function withoutPatterns(args) {
  return args.filter(
    (argument, index) => argument !== '--pattern' && args[index - 1] !== '--pattern',
  );
}

function existsInside(projectRoot, file) {
  const root = path.resolve(projectRoot);
  const full = path.resolve(root, file);
  if (!full.startsWith(root + path.sep)) {
    return false;
  }
  return existsSync(full);
}

function scopedInvocation(invocation, { projectRoot, paths }) {
  const matchers = patternsOf(invocation.args).map((pattern) => globMatcher(pattern));
  const files = paths.filter(
    (file) => matchers.some((matcher) => matcher.test(file)) && existsInside(projectRoot, file),
  );
  if (files.length === 0) {
    return {
      ...invocation,
      args: ['--input-type=module', '--eval', EMPTY_REPORT_SCRIPT],
    };
  }
  return {
    ...invocation,
    args: [
      ...withoutPatterns(invocation.args),
      ...files.flatMap((file) => ['--pattern', file.replaceAll(GLOB_SPECIAL, String.raw`\$&`)]),
    ],
  };
}

function scopedAnalyzer(analyzer, { paths, digest }) {
  const { resolveConfigurationHash } = analyzer;
  return {
    ...analyzer,
    configurationHash: scopeHash(analyzer.configurationHash, digest),
    ...(resolveConfigurationHash === undefined
      ? {}
      : { resolveConfigurationHash: (root) => scopeHash(resolveConfigurationHash(root), digest) }),
    createInvocation: (context) =>
      scopedInvocation(analyzer.createInvocation(context), {
        projectRoot: context.projectRoot,
        paths,
      }),
  };
}

export function scopeToTouchedFiles(analyzers, touchedPaths) {
  const paths = [...touchedPaths].sort();
  const digest = createHash('sha256').update(JSON.stringify(paths)).digest('hex');
  return analyzers.map((analyzer) =>
    FILE_LOCAL_ANALYZERS.has(analyzer.name) && analyzer.custom !== true
      ? scopedAnalyzer(analyzer, { paths, digest })
      : analyzer,
  );
}
