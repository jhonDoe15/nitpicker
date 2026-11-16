import { containedPath } from '../../../core/fix/common/contained-path.mjs';
import { failureText } from '../../../core/fix/common/fix-command.mjs';
import { KOTLIN_FORMATTERS } from '../adapters/style/jvm-formatters.mjs';
import { callUntyped } from '../adapters/typed/java-values.mts';
import { fieldOf, listOf, textOf } from '../../../shared/values/readers.mts';
import {
  readWorkspaceFile,
  runFormatterJar,
  withWorkspace,
  writeWorkspaceFile,
} from './formatter-run.mts';

type Invocation = {
  readonly tools: unknown;
  readonly style: unknown;
  readonly directory: string;
  readonly names: readonly string[];
};
type Formatter = {
  readonly operation: string;
  readonly invocation: (request: Invocation) => string[];
  readonly reported: (name: string) => string;
};
type KotlinFormatterPlan = {
  readonly label: string;
  readonly operation: string;
  readonly tools: Readonly<Record<string, unknown>>;
};
type KotlinFormatRequest = {
  readonly formatter: unknown;
  readonly tools: unknown;
  readonly style: unknown;
  readonly classpath: unknown;
  readonly executeFixCommand: unknown;
};
type Sources = ReadonlyMap<string, string | Uint8Array>;
type Formatted = {
  readonly formatted: Map<string, string>;
  readonly unformattable: string[];
};

const ROOT_EDITORCONFIG = { path: '.editorconfig', text: 'root = true\n' };
const DEFAULTS_FILE = 'ktlint-defaults.editorconfig';
const MIRROR = 'workspace';
const PARSE_FAILURE = /^:\d+:\d+: (?:error:|Not a valid Kotlin file)/u;

function ktlintInvocation({ style, directory, names }: Invocation): string[] {
  const defaults = fieldOf(style, 'ktlintDefaults');
  if (defaults !== undefined) {
    writeWorkspaceFile(directory, DEFAULTS_FILE, textOf(defaults));
  }
  return [
    '--format',
    '--relative',
    ...(defaults === undefined
      ? []
      : [`--editorconfig=${textOf(containedPath(directory, DEFAULTS_FILE))}`]),
    '--',
    ...names,
  ];
}

function ktfmtInvocation({ tools, names }: Invocation): string[] {
  const maxWidth = fieldOf(tools, 'ktfmtMaxWidth');
  return [
    `--${textOf(fieldOf(tools, 'ktfmtStyle'))}-style`,
    ...(maxWidth === undefined ? [] : [`--max-width=${textOf(maxWidth)}`]),
    ...(fieldOf(tools, 'ktfmtEditorconfig') === true ? ['--enable-editorconfig'] : []),
    ...names.map((name) => `./${name}`),
  ];
}

const FORMATTERS: ReadonlyMap<unknown, Formatter> = new Map([
  ['ktlint', { operation: 'ktlint-fix', invocation: ktlintInvocation, reported: (name) => name }],
  [
    'ktfmt',
    { operation: 'ktfmt-fix', invocation: ktfmtInvocation, reported: (name) => `./${name}` },
  ],
]);

function kotlinFormatterOf(formatter: unknown): unknown {
  return fieldOf(KOTLIN_FORMATTERS, textOf(formatter));
}

export function kotlinFormatterPlan(
  formatter: unknown,
  pinned: unknown,
): KotlinFormatterPlan | undefined {
  const entry = FORMATTERS.get(formatter);
  if (entry === undefined) {
    return undefined;
  }
  const tool = kotlinFormatterOf(formatter);
  return {
    label: textOf(fieldOf(tool, 'label')),
    operation: entry.operation,
    tools: {
      [textOf(formatter)]: {
        coordinates: callUntyped(fieldOf(tool, 'coordinates'), pinned),
        transitive: false,
      },
    },
  };
}

function mirrorRoot(directory: string, style: unknown): string {
  const root: string = containedPath(directory, MIRROR);
  const editorconfigs = fieldOf(style, 'editorconfigs') ?? [ROOT_EDITORCONFIG];
  for (const editorconfig of listOf(editorconfigs)) {
    const relative = textOf(fieldOf(editorconfig, 'path'));
    writeWorkspaceFile(root, relative, textOf(fieldOf(editorconfig, 'text')));
  }
  const offset = fieldOf(style, 'offset');
  return typeof offset === 'string' && offset !== '' ? containedPath(root, offset) : root;
}

function parseFailures(
  result: unknown,
  names: readonly string[],
  reported: (name: string) => string,
): string[] {
  const stdout = fieldOf(result, 'stdout') ?? '';
  const stderr = fieldOf(result, 'stderr') ?? '';
  const lines = `${textOf(stdout)}\n${textOf(stderr)}`.split(/\r?\n/u);
  return names.filter((name) =>
    lines.some(
      (line) =>
        line.startsWith(`${reported(name)}:`) &&
        PARSE_FAILURE.test(line.slice(reported(name).length)),
    ),
  );
}

export function kotlinFormat({
  formatter,
  tools,
  style,
  classpath,
  executeFixCommand,
}: KotlinFormatRequest): (sources: Sources) => Formatted {
  const entry = FORMATTERS.get(formatter);
  if (entry === undefined) {
    throw new TypeError(`${textOf(formatter)} is not a Kotlin formatter`);
  }
  const { operation, invocation, reported } = entry;
  const tool = kotlinFormatterOf(formatter);
  const label = textOf(fieldOf(tool, 'label'));
  const mainClass = textOf(fieldOf(tool, 'mainClass'));
  return function format(sources) {
    return withWorkspace((directory) => {
      const names = [...sources.keys()];
      const root = mirrorRoot(directory, style);
      for (const name of names) {
        writeWorkspaceFile(root, name, sources.get(name) ?? '');
      }
      const result = runFormatterJar({
        operation,
        tool: label,
        classpath,
        mainClass,
        args: invocation({ tools, style, directory, names }),
        cwd: root,
        acceptedStatuses: [0, 1],
        executeFixCommand,
      });
      const unformattable = parseFailures(result, names, reported);
      if (formatter === 'ktfmt' && fieldOf(result, 'status') !== 0 && unformattable.length === 0) {
        throw new Error(`${label} failed: ${textOf(failureText(result))}`);
      }
      return {
        formatted: new Map(names.map((name) => [name, readWorkspaceFile(root, name)])),
        unformattable,
      };
    });
  };
}
