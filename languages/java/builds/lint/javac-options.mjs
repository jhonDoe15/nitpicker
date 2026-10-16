const RELEASE = '--release';
const SOURCE = '-source';
const TARGET = '-target';
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
const DROPPED_PREFIXES = ['-Xlint', '-Xdoclint', '-proc:', '-implicit:', '-Xplugin:', '-J'];
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
    arg === '-Werror' ||
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
    optionValue(compiler.args, [RELEASE]) ??
    optionValue(compiler.args, [TARGET, '--target']) ??
    compiler.target ??
    DEFAULT_LEVEL
  );
}

export function languageLevel(compiler) {
  if (compiler.release !== undefined) {
    return [RELEASE, compiler.release];
  }
  if (hasOption(compiler.args, [RELEASE])) {
    return [];
  }
  const source = hasOption(compiler.args, [SOURCE, '--source'])
    ? undefined
    : (compiler.source ?? DEFAULT_LEVEL);
  const target = hasOption(compiler.args, [TARGET, '--target'])
    ? undefined
    : (compiler.target ?? DEFAULT_LEVEL);
  return [
    ...(source === undefined ? [] : [SOURCE, source]),
    ...(target === undefined ? [] : [TARGET, target]),
  ];
}
