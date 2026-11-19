import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { LintCompiler } from '../typed/lint-plan.mts';

const PAIRED_OPTIONS = new Set([
  '-Xmaxwarns',
  '-Xmaxerrs',
  '-processor',
  '-processorpath',
  '--processor-path',
  '--processor-module-path',
  '--module-path',
  '-p',
  '-d',
  '-s',
  '-h',
  '-encoding',
  '-cp',
  '-classpath',
  '--class-path',
  '-sourcepath',
  '--source-path',
]);
const DROPPED_PREFIXES = [
  '-Xlint',
  '-Xdoclint',
  '-Xdiags:',
  '-XD',
  '-proc:',
  '-implicit:',
  '-Xplugin:',
  '-J',
];
const DROPPED_FLAGS = new Set(['-Werror', '-nowarn']);
const DROPPED_OPTIONS = [
  '--processor-path',
  '--processor-module-path',
  '--module-path',
  '--class-path',
  '--source-path',
];
const DEFAULT_LEVEL = '8';
const RELEASE_FLAG = '--release';
const TARGET_FLAG = '-target';

type KeepState = { readonly kept: string[]; readonly skipNext: boolean };
type TokenState = {
  readonly tokens: string[];
  readonly token: string | undefined;
  readonly quote: string | undefined;
  readonly comment: boolean;
  readonly escape: boolean;
  readonly continued: boolean;
};

function isDropped(arg: string): boolean {
  return (
    DROPPED_FLAGS.has(arg) ||
    DROPPED_PREFIXES.some((prefix) => arg.startsWith(prefix)) ||
    DROPPED_OPTIONS.some((prefix) => arg.startsWith(`${prefix}=`))
  );
}

function keepStep(state: KeepState, arg: string): KeepState {
  if (state.skipNext) {
    return { kept: state.kept, skipNext: false };
  }
  if (PAIRED_OPTIONS.has(arg)) {
    return { kept: state.kept, skipNext: true };
  }
  return { kept: isDropped(arg) ? state.kept : [...state.kept, arg], skipNext: false };
}

export function lintCompatible(args: readonly string[]): string[] {
  const initial: KeepState = { kept: [], skipNext: false };
  return args.reduce(keepStep, initial).kept;
}

function hasOption(args: readonly string[], names: readonly string[]): boolean {
  return args.some((arg) => names.some((name) => arg === name || arg.startsWith(`${name}=`)));
}

function optionValue(args: readonly string[], names: readonly string[]): string | undefined {
  return args
    .flatMap((arg, index) =>
      names.flatMap((name) => {
        if (arg === name) {
          return args.slice(index + 1, index + 2);
        }
        return arg.startsWith(`${name}=`) ? [arg.slice(name.length + 1)] : [];
      }),
    )
    .at(-1);
}

export function targetRelease(compiler: LintCompiler): string {
  return (
    compiler.release ??
    optionValue(compiler.args, [RELEASE_FLAG]) ??
    optionValue(compiler.args, [TARGET_FLAG, '--target']) ??
    compiler.target ??
    DEFAULT_LEVEL
  );
}

export function languageLevel(compiler: LintCompiler): string[] {
  if (compiler.release !== undefined) {
    return [RELEASE_FLAG, compiler.release];
  }
  if (hasOption(compiler.args, [RELEASE_FLAG])) {
    return [];
  }
  const source = hasOption(compiler.args, ['-source', '--source'])
    ? undefined
    : (compiler.source ?? DEFAULT_LEVEL);
  const target = hasOption(compiler.args, [TARGET_FLAG, '--target'])
    ? undefined
    : (compiler.target ?? DEFAULT_LEVEL);
  return [
    ...(source === undefined ? [] : ['-source', source]),
    ...(target === undefined ? [] : [TARGET_FLAG, target]),
  ];
}

const ESCAPES: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t', f: '\f' };

function escapedStep(state: TokenState, char: string): TokenState {
  return /[\n\r]/u.test(char)
    ? { ...state, escape: false, continued: true }
    : { ...state, escape: false, token: (state.token ?? '') + (ESCAPES[char] ?? char) };
}

function quotedStep(state: TokenState, char: string): TokenState {
  if (char === '\\') {
    return { ...state, escape: true };
  }
  if (char === state.quote) {
    return { ...state, quote: undefined };
  }
  return { ...state, token: (state.token ?? '') + char };
}

function tokenStep(state: TokenState, char: string): TokenState {
  if (state.comment) {
    return /[\n\r]/u.test(char) ? { ...state, comment: false } : state;
  }
  if (state.escape) {
    return escapedStep(state, char);
  }
  if (state.continued && /\s/u.test(char)) {
    return state;
  }
  if (state.quote !== undefined) {
    return quotedStep({ ...state, continued: false }, char);
  }
  if (/\s/u.test(char)) {
    return state.token === undefined
      ? state
      : { ...state, tokens: [...state.tokens, state.token], token: undefined };
  }
  if (char === '#' && state.token === undefined) {
    return { ...state, comment: true };
  }
  const token = state.token ?? '';
  return /["']/u.test(char) ? { ...state, token, quote: char } : { ...state, token: token + char };
}

export function argumentFileToken(value: unknown): string {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

export function argumentFileTokens(text: string): string[] {
  const start: TokenState = {
    tokens: [],
    token: undefined,
    quote: undefined,
    comment: false,
    escape: false,
    continued: false,
  };
  const state = Array.from(text).reduce(tokenStep, start);
  return state.token === undefined ? state.tokens : [...state.tokens, state.token];
}

function expandedArgument(arg: string, directory: string): string[] {
  if (arg.startsWith('@@')) {
    return [arg.slice(1)];
  }
  const file = arg.startsWith('@') ? path.resolve(directory, arg.slice(1)) : undefined;
  return file !== undefined && existsSync(file)
    ? argumentFileTokens(readFileSync(file, 'utf8'))
    : [arg];
}

export function lintCompiler({
  compiler,
  basedir,
}: {
  readonly compiler: LintCompiler;
  readonly basedir: string;
}): LintCompiler {
  return { ...compiler, args: compiler.args.flatMap((arg) => expandedArgument(arg, basedir)) };
}
