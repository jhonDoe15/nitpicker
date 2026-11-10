import { containedPath } from '../../../core/fix/common/contained-path.mjs';
import { failureText } from '../../../core/fix/common/fix-command.mjs';
import { KOTLIN_FORMATTERS } from '../adapters/style/jvm-formatters.mjs';
import {
  readWorkspaceFile,
  runFormatterJar,
  withWorkspace,
  writeWorkspaceFile,
} from './formatter-run.mjs';

const ROOT_EDITORCONFIG = { path: '.editorconfig', text: 'root = true\n' };
const DEFAULTS_FILE = 'ktlint-defaults.editorconfig';
const MIRROR = 'workspace';

function ktlintInvocation({ style, directory, names }) {
  const defaults = style?.ktlintDefaults;
  if (defaults !== undefined) {
    writeWorkspaceFile(directory, DEFAULTS_FILE, defaults);
  }
  return [
    '--format',
    '--relative',
    ...(defaults === undefined
      ? []
      : [`--editorconfig=${containedPath(directory, DEFAULTS_FILE)}`]),
    '--',
    ...names,
  ];
}

function ktfmtInvocation({ tools, names }) {
  return [
    `--${tools.ktfmtStyle}-style`,
    ...(tools.ktfmtMaxWidth === undefined ? [] : [`--max-width=${tools.ktfmtMaxWidth}`]),
    ...(tools.ktfmtEditorconfig ? ['--enable-editorconfig'] : []),
    ...names.map((name) => `./${name}`),
  ];
}

const FORMATTERS = {
  ktlint: { operation: 'ktlint-fix', invocation: ktlintInvocation, reported: (name) => name },
  ktfmt: { operation: 'ktfmt-fix', invocation: ktfmtInvocation, reported: (name) => `./${name}` },
};

export function kotlinFormatterPlan(formatter, pinned) {
  const entry = FORMATTERS[formatter];
  return entry === undefined
    ? undefined
    : {
        label: KOTLIN_FORMATTERS[formatter].label,
        operation: entry.operation,
        tools: {
          [formatter]: {
            coordinates: KOTLIN_FORMATTERS[formatter].coordinates(pinned),
            transitive: false,
          },
        },
      };
}

function mirrorRoot(directory, style) {
  const root = containedPath(directory, MIRROR);
  for (const { path: relative, text } of style?.editorconfigs ?? [ROOT_EDITORCONFIG]) {
    writeWorkspaceFile(root, relative, text);
  }
  return style?.offset ? containedPath(root, style.offset) : root;
}

function parseFailures(result, names, reported) {
  const lines = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.split(/\r?\n/u);
  return names.filter((name) =>
    lines.some(
      (line) =>
        line.startsWith(`${reported(name)}:`) &&
        /^:\d+:\d+: (?:error:|Not a valid Kotlin file)/u.test(line.slice(reported(name).length)),
    ),
  );
}

export function kotlinFormat({ formatter, tools, style, classpath, executeFixCommand }) {
  const { operation, invocation, reported } = FORMATTERS[formatter];
  const { label, mainClass } = KOTLIN_FORMATTERS[formatter];
  return function format(sources) {
    return withWorkspace((directory) => {
      const names = [...sources.keys()];
      const root = mirrorRoot(directory, style);
      for (const name of names) {
        writeWorkspaceFile(root, name, sources.get(name));
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
      if (formatter === 'ktfmt' && result.status !== 0 && unformattable.length === 0) {
        throw new Error(`${label} failed: ${failureText(result)}`);
      }
      return {
        formatted: new Map(names.map((name) => [name, readWorkspaceFile(root, name)])),
        unformattable,
      };
    });
  };
}
