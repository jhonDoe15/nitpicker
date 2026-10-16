import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

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

function isDropped(arg) {
  return (
    DROPPED_FLAGS.has(arg) ||
    DROPPED_PREFIXES.some((prefix) => arg.startsWith(prefix)) ||
    DROPPED_OPTIONS.some((prefix) => arg.startsWith(`${prefix}=`))
  );
}

function keepStep(state, arg) {
  if (state.skipNext) {
    return { kept: state.kept, skipNext: false };
  }
  if (PAIRED_OPTIONS.has(arg)) {
    return { kept: state.kept, skipNext: true };
  }
  return { kept: isDropped(arg) ? state.kept : [...state.kept, arg], skipNext: false };
}

export function lintCompatible(args) {
  return args.reduce(keepStep, { kept: [], skipNext: false }).kept;
}

function hasOption(args, names) {
  return args.some((arg) => names.some((name) => arg === name || arg.startsWith(`${name}=`)));
}

function optionValue(args, names) {
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

export function targetRelease(compiler) {
  return (
    compiler.release ??
    optionValue(compiler.args, ['--release']) ??
    optionValue(compiler.args, ['-target', '--target']) ??
    compiler.target ??
    DEFAULT_LEVEL
  );
}

export function languageLevel(compiler) {
  if (compiler.release !== undefined) {
    return ['--release', compiler.release];
  }
  if (hasOption(compiler.args, ['--release'])) {
    return [];
  }
  const source = hasOption(compiler.args, ['-source', '--source'])
    ? undefined
    : (compiler.source ?? DEFAULT_LEVEL);
  const target = hasOption(compiler.args, ['-target', '--target'])
    ? undefined
    : (compiler.target ?? DEFAULT_LEVEL);
  return [
    ...(source === undefined ? [] : ['-source', source]),
    ...(target === undefined ? [] : ['-target', target]),
  ];
}

const ESCAPES = { n: '\n', r: '\r', t: '\t', f: '\f' };

function quotedStep(state, char, next) {
  if (char === '\\' && /[\n\r]/u.test(next ?? '')) {
    return { ...state, continued: true, skip: 1 };
  }
  if (char === '\\') {
    return { ...state, token: state.token + (ESCAPES[next] ?? next ?? ''), skip: 1 };
  }
  if (char === state.quote) {
    return { ...state, quote: undefined };
  }
  return { ...state, token: state.token + char };
}

function tokenStep(state, char, next) {
  if (state.comment) {
    return /[\n\r]/u.test(char) ? { ...state, comment: false } : state;
  }
  if (state.continued && /\s/u.test(char)) {
    return state;
  }
  if (state.quote !== undefined) {
    return quotedStep({ ...state, continued: false }, char, next);
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

export function argumentFileTokens(text) {
  let state = {
    tokens: [],
    token: undefined,
    quote: undefined,
    comment: false,
    continued: false,
    skip: 0,
  };
  for (let index = 0; index < text.length; index += 1 + state.skip) {
    state = tokenStep({ ...state, skip: 0 }, text[index], text[index + 1]);
  }
  return state.token === undefined ? state.tokens : [...state.tokens, state.token];
}

function expandedArgument(arg, directory) {
  if (arg.startsWith('@@')) {
    return [arg.slice(1)];
  }
  const file = arg.startsWith('@') ? path.resolve(directory, arg.slice(1)) : undefined;
  return file !== undefined && existsSync(file)
    ? argumentFileTokens(readFileSync(file, 'utf8'))
    : [arg];
}

export function lintCompiler({ compiler, basedir }) {
  return { ...compiler, args: compiler.args.flatMap((arg) => expandedArgument(arg, basedir)) };
}
