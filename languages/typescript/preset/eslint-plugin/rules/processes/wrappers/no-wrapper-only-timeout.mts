import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  constantNumber,
  resolveConstant,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { describeSubprocess, type ModuleBindings } from '../../analysis/subprocess-calls.mts';
import { staticText } from '../../child-heaps/child-calls.mts';
import { enclosingFunction } from '../../typed/syntax-views.mts';
import { calleeMethod, trackedBindings } from '../process-callees.mts';
import { optionsArgument } from '../process-timeout-options.mts';
import { baseName } from '../output/growing-commands.mts';
import { literalOption, optionValue } from '../output/process-options.mts';

const SHELL_FORMS = new Set(['execSync', 'exec']);
const FILE_FORMS = new Set([
  'execFileSync',
  'execFile',
  'spawnSync',
  'spawn',
  'execa',
  'execaSync',
]);
const LAUNCHERS = new Set([
  'sh',
  'bash',
  'zsh',
  'dash',
  'ksh',
  'cmd',
  'cmd.exe',
  'powershell',
  'powershell.exe',
  'pwsh',
  'npx',
  'npx.cmd',
  'gradlew.bat',
  'mvnw.cmd',
]);
const PACKAGE_MANAGERS = new Set(['npm', 'npm.cmd', 'yarn', 'yarn.cmd', 'pnpm', 'pnpm.cmd']);
const SCRIPT_RUNS = new Set([
  'run',
  'run-script',
  'rum',
  'urn',
  'exec',
  'x',
  'dlx',
  'test',
  'tst',
  't',
  'start',
  'stop',
  'restart',
]);
const SCRIPT = /\.(?:sh|bat|cmd|ps1)$/iu;
const COMPOUND = /&&|\|\||[;|&\n`]|\$\(/u;
const QUOTED = /'[^']*'|"[^"]*"/gu;
const REDIRECT = /\d*>&\d+|&>/gu;
const NO_VALUES = new Set(['undefined', 'Infinity']);
type Wrapping = {
  readonly method: string;
  readonly bindings: ModuleBindings;
  readonly options: TSESTree.Node | undefined;
};

const GROUP_KILL = /process\.kill\(\s*-|taskkill|tree-?kill/iu;

function isLauncher(command: string | undefined): boolean {
  if (command === undefined) {
    return false;
  }
  const name = baseName(command);
  return LAUNCHERS.has(name.toLowerCase()) || SCRIPT.test(name);
}

const DEADLINE_KEYS = ['timeout', 'signal', 'cancelSignal'];

function isCompound(text: string): boolean {
  return COMPOUND.test(text.replaceAll(QUOTED, ' ').replaceAll(REDIRECT, ' '));
}

function given(node: TSESTree.Node | undefined): boolean {
  if (node === undefined) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.Identifier) {
    return !NO_VALUES.has(node.name);
  }
  return !(node.type === AST_NODE_TYPES.Literal && node.value === null);
}

function hasDeadline(context: SourceContext, options: TSESTree.Node | undefined): boolean {
  const [timeout, signal, cancel] = DEADLINE_KEYS.map((key) => optionValue(context, options, key));
  if (!(timeout?.known && signal?.known && cancel?.known)) {
    return false;
  }
  const limit =
    timeout.value === undefined
      ? undefined
      : constantNumber(context, resolveConstant(context, timeout.value));
  const timed =
    given(timeout.value) && (limit === undefined || (Number.isFinite(limit) && limit > 0));
  return timed || given(signal.value) || given(cancel.value);
}

const POSIX_SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const SHORT_FLAGS = /^-[a-z]+$/u;
const VALUE_FLAGS = new Set([
  '--filter',
  '-F',
  '--dir',
  '-C',
  '--prefix',
  '--cwd',
  '-w',
  '--workspace',
]);

function runsScript(tokens: readonly string[]): boolean {
  const subcommand = tokens.find(
    (token, index) => !(token.startsWith('-') || VALUE_FLAGS.has(tokens[index - 1] ?? '')),
  );
  return subcommand !== undefined && SCRIPT_RUNS.has(subcommand);
}

function startsWrapper(command: string | undefined, tokens: readonly string[]): boolean {
  if (command !== undefined && PACKAGE_MANAGERS.has(baseName(command).toLowerCase())) {
    return runsScript(tokens);
  }
  return isLauncher(command);
}

function scriptWraps(script: string | undefined): boolean {
  if (script === undefined || script.trim() === '') {
    return false;
  }
  const [first, ...rest] = script.trim().split(/\s+/u);
  return isCompound(script) || startsWrapper(first, rest);
}

function fileWrapper(command: string | undefined, tokens: readonly string[]): string | undefined {
  if (command === undefined || !startsWrapper(command, tokens)) {
    return undefined;
  }
  if (!POSIX_SHELLS.has(baseName(command))) {
    return `\`${command}\``;
  }
  const flag = tokens.findIndex((token) => SHORT_FLAGS.test(token) && token.includes('c'));
  const wraps =
    flag === -1 ? tokens.some((token) => !token.startsWith('-')) : scriptWraps(tokens[flag + 1]);
  return wraps ? `\`${command}\`` : undefined;
}

function shellWrapper(text: string | undefined): string | undefined {
  if (text === undefined) {
    return undefined;
  }
  if (isCompound(text)) {
    return 'a shell';
  }
  const [first, ...rest] = text.trim().split(/\s+/u);
  return fileWrapper(first, rest);
}

function wrapperOf(
  context: SourceContext,
  call: TSESTree.CallExpression,
  { method, bindings, options }: Wrapping,
): string | undefined {
  if (SHELL_FORMS.has(method)) {
    return shellWrapper(staticText(context, call.arguments[0], ' X '));
  }
  if (!FILE_FORMS.has(method)) {
    return undefined;
  }
  const subprocess = describeSubprocess(context, call, bindings);
  const wrapper = fileWrapper(subprocess?.command, subprocess?.tokens ?? []);
  if (wrapper !== undefined) {
    return wrapper;
  }
  const shell = literalOption(context, options, 'shell');
  return shell !== undefined &&
    shell !== false &&
    isCompound(staticText(context, call.arguments[0], ' X ') ?? '')
    ? 'a shell'
    : undefined;
}

function killsGroup(
  context: SourceContext,
  call: TSESTree.CallExpression,
  options: TSESTree.Node | undefined,
): boolean {
  const scope = enclosingFunction(call) ?? context.sourceCode.ast;
  return (
    literalOption(context, options, 'detached') === true &&
    GROUP_KILL.test(context.sourceCode.getText(scope))
  );
}

export const rule: TSESLint.RuleModule<'wrapperOnlyTimeout'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a subprocess deadline that stops only a shell or launcher and leaves its children running',
    },
    schema: [],
    messages: {
      wrapperOnlyTimeout:
        'The deadline of this call stops only the process it started, and that process is {{wrapper}}: a shell, a launcher or a script whose real work runs in a child of it. When the time runs out the wrapper dies, the call returns, and the child keeps running, holding CPU, memory, files and ports, and may still write into a folder the caller is deleting. Start the command without the wrapper (the executable and its arguments), or start it with detached: true and kill the whole group on timeout (process.kill(-child.pid) on POSIX, taskkill /T /F on Windows).',
    },
  },
  create(context) {
    return trackedBindings('plain', (current) => ({
      CallExpression(node) {
        const method = calleeMethod(node.callee, current());
        if (
          method === undefined ||
          node.arguments.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement)
        ) {
          return;
        }
        const options = optionsArgument(context, node, SHELL_FORMS.has(method));
        if (!hasDeadline(context, options)) {
          return;
        }
        const wrapper = wrapperOf(context, node, { method, bindings: current(), options });
        if (wrapper !== undefined && !killsGroup(context, node, options)) {
          context.report({
            node,
            messageId: 'wrapperOnlyTimeout',
            data: { wrapper },
          });
        }
      },
    }));
  },
};
