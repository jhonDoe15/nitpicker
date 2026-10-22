import {
  readWorkspaceFile,
  runFormatterJar,
  withWorkspace,
  workspaceFile,
  writeWorkspaceFile,
} from './formatter-run.mjs';

const ROOT_EDITORCONFIG = { path: '.editorconfig', text: 'root = true\n' };
const DEFAULTS_FILE = 'ktlint-defaults.editorconfig';
const MIRROR = 'workspace';

function ktlintInvocation({ style, directory }) {
  const defaults = style?.ktlintDefaults;
  if (defaults !== undefined) {
    writeWorkspaceFile(directory, DEFAULTS_FILE, defaults);
  }
  return {
    mainClass: 'com.pinterest.ktlint.Main',
    options: [
      '--format',
      '--relative',
      ...(defaults === undefined
        ? []
        : [`--editorconfig=${workspaceFile(directory, DEFAULTS_FILE)}`]),
    ],
  };
}

function ktfmtInvocation({ tools }) {
  return {
    mainClass: 'com.facebook.ktfmt.cli.Main',
    options: [
      `--${tools.ktfmtStyle}-style`,
      ...(tools.ktfmtMaxWidth === undefined ? [] : [`--max-width=${tools.ktfmtMaxWidth}`]),
      ...(tools.ktfmtEditorconfig ? ['--enable-editorconfig'] : []),
    ],
  };
}

const FORMATTERS = {
  ktlint: {
    label: 'ktlint',
    operation: 'ktlint-fix',
    invocation: ktlintInvocation,
    tool: (pinned) => ({
      coordinates: `com.pinterest.ktlint:ktlint-cli:${pinned.ktlint}:all`,
      transitive: false,
    }),
  },
  ktfmt: {
    label: 'ktfmt',
    operation: 'ktfmt-fix',
    invocation: ktfmtInvocation,
    tool: (pinned) => ({
      coordinates: `com.facebook:ktfmt:${pinned.ktfmt}:with-dependencies`,
      transitive: false,
    }),
  },
};

export function kotlinFormatterPlan(formatter, pinned) {
  const entry = FORMATTERS[formatter];
  return entry === undefined
    ? undefined
    : {
        label: entry.label,
        operation: entry.operation,
        tools: { [formatter]: entry.tool(pinned) },
      };
}

function mirrorRoot(directory, style) {
  const root = workspaceFile(directory, MIRROR);
  for (const { path: relative, text } of style?.editorconfigs ?? [ROOT_EDITORCONFIG]) {
    writeWorkspaceFile(root, relative, text);
  }
  return style?.offset ? workspaceFile(root, style.offset) : root;
}

export function kotlinFormat({ formatter, tools, style, classpath, executeFixCommand }) {
  const { label, operation, invocation } = FORMATTERS[formatter];
  return function format(sources) {
    return withWorkspace((directory) => {
      const names = [...sources.keys()];
      const root = mirrorRoot(directory, style);
      for (const name of names) {
        writeWorkspaceFile(root, name, sources.get(name));
      }
      const { mainClass, options } = invocation({
        tools,
        style,
        directory,
      });
      const result = runFormatterJar({
        operation,
        tool: label,
        classpath,
        mainClass,
        args: [...options, ...names],
        cwd: root,
        acceptedStatuses: [0, 1],
        executeFixCommand,
      });
      const unformattable = names.filter((name) =>
        result.stderr.includes(`Error formatting ${name}`),
      );
      if (formatter === 'ktfmt' && result.status !== 0 && unformattable.length === 0) {
        throw new Error(`${label} failed: ${result.stderr.trim() || `exit ${result.status}`}`);
      }
      return {
        formatted: new Map(names.map((name) => [name, readWorkspaceFile(root, name)])),
        unformattable,
      };
    });
  };
}
