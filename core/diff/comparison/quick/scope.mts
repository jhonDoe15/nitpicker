import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { globMatcher } from '../../../../shared/paths/glob.mjs';
import { byText } from '../../../../shared/text-order/by-text.mjs';
import type { ProfiledAnalyzer } from '../../../../shared/values/analyzers.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

type Invocation = ReturnType<ProfiledAnalyzer['createInvocation']>;

type ScopedFiles = {
  readonly paths: readonly string[];
  readonly digest: string;
};

const matcherOf: (glob: string) => { readonly test: (file: string) => boolean } = globMatcher;
const textOrder: (left: string, right: string) => number = byText;

const FILE_LOCAL_ANALYZERS = new Set([
  'prettier-format',
  'eslint-errors',
  'eslint-logging',
  'eslint-module-effects',
]);
const PATTERN_FLAG = '--pattern';
const GLOB_SPECIAL = /[*?[\]{}()!\\]/gu;
const EMPTY_REPORT_SCRIPT = String.raw`process.stdout.write(JSON.stringify({ findings: [] }) + '\n');`;

function scopeHash(configurationHash: unknown, digest: string): string {
  return createHash('sha256')
    .update(`${textOf(configurationHash)}\0scope\0${digest}`)
    .digest('hex');
}

function patternsOf(args: readonly string[]): string[] {
  return args.flatMap((argument, index) => (args[index - 1] === PATTERN_FLAG ? [argument] : []));
}

function withoutPatterns(args: readonly string[]): string[] {
  return args.filter(
    (argument, index) => argument !== PATTERN_FLAG && args[index - 1] !== PATTERN_FLAG,
  );
}

function existsInside(projectRoot: string, file: string): boolean {
  const root = path.resolve(projectRoot);
  const full = path.resolve(root, file);
  if (!full.startsWith(root + path.sep)) {
    return false;
  }
  return existsSync(full);
}

function scopedInvocation(
  invocation: Invocation,
  { projectRoot, paths }: { readonly projectRoot: string; readonly paths: readonly string[] },
): Invocation {
  const matchers = patternsOf(invocation.args).map((pattern) => matcherOf(pattern));
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
      ...files.flatMap((file) => [PATTERN_FLAG, file.replaceAll(GLOB_SPECIAL, String.raw`\$&`)]),
    ],
  };
}

function scopedAnalyzer(
  analyzer: ProfiledAnalyzer,
  { paths, digest }: ScopedFiles,
): ProfiledAnalyzer {
  const { resolveConfigurationHash } = analyzer;
  return {
    ...analyzer,
    configurationHash: scopeHash(analyzer.configurationHash, digest),
    ...(resolveConfigurationHash === undefined
      ? {}
      : {
          resolveConfigurationHash: (root: string) =>
            scopeHash(resolveConfigurationHash(root), digest),
        }),
    createInvocation: (context: unknown) =>
      scopedInvocation(analyzer.createInvocation(context), {
        projectRoot: textOf(fieldOf(context, 'projectRoot')),
        paths,
      }),
  };
}

function isFileLocal(analyzer: unknown): analyzer is ProfiledAnalyzer {
  return (
    typeof analyzer === 'object' &&
    analyzer !== null &&
    'name' in analyzer &&
    typeof analyzer.name === 'string' &&
    FILE_LOCAL_ANALYZERS.has(analyzer.name) &&
    'createInvocation' in analyzer &&
    typeof analyzer.createInvocation === 'function' &&
    (!('custom' in analyzer) || analyzer.custom !== true)
  );
}

export function scopeToTouchedFiles(
  analyzers: readonly unknown[],
  touchedPaths: Iterable<string>,
): unknown[] {
  const paths = [...touchedPaths].sort(textOrder);
  const digest = createHash('sha256').update(JSON.stringify(paths)).digest('hex');
  return analyzers.map((analyzer) =>
    isFileLocal(analyzer) ? scopedAnalyzer(analyzer, { paths, digest }) : analyzer,
  );
}
