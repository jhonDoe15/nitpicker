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
