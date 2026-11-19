import {
  consoleAllowMatcher as consoleAllowMatcherUntyped,
  consoleTokens as consoleTokensUntyped,
} from '../../../../shared/rules/console/console-findings.mjs';
import { normalizeConsoleMessage as normalizeConsoleMessageUntyped } from '../../../../shared/rules/console/console-messages.mjs';
import {
  exceptionHint as exceptionHintUntyped,
  exceptionMatcher as exceptionMatcherUntyped,
} from '../../../../shared/rules/exceptions.mjs';
import { hash as hashUntyped } from '../../../../shared/rules/finding-helpers.mjs';
import { inModule as inModuleUntyped } from '../../builds/module-path.mts';
import { readConsoleEntries } from './console-output.mts';
import type { JavaFinding } from '../typed/java-values.mts';

type ConsoleEntry = { readonly file: string; readonly test: string; readonly messages: string[] };
type ConsoleAllow = { readonly contains: string; readonly paths?: readonly string[] };
type ConsoleOptions = {
  readonly allow?: readonly ConsoleAllow[];
  readonly exceptions?: readonly unknown[];
  readonly modulePath?: string;
  readonly moduleRoot?: string;
};
type PrintedMessage = { readonly file: string; readonly test: string; readonly message: string };

const consoleAllowMatcher: (
  allow: readonly ConsoleAllow[],
) => (file: string, message: string) => boolean = consoleAllowMatcherUntyped;
const consoleTokens: (message: string) => { readonly tokens?: string[] } = consoleTokensUntyped;
const normalizeConsoleMessage: (message: string) => string = normalizeConsoleMessageUntyped;
const exceptionHint: (rule: string, file: string) => string = exceptionHintUntyped;
const exceptionMatcher: (
  exceptions: readonly unknown[],
) => (rule: string, ...candidates: readonly string[]) => boolean = exceptionMatcherUntyped;
const hash: (text: string) => string = hashUntyped;
const inModule: (modulePath: string | undefined, relativePath: string) => string = inModuleUntyped;

const CONSOLE_TOOL = 'test-runtime';
const CONSOLE_RULE = 'test-console-output';
export const CONSOLE_EXCEPTION_RULE = `${CONSOLE_TOOL}/${CONSOLE_RULE}`;
const MESSAGE =
  'Tests print new console output: {output}. Fix the cause (for example a warning the code under test now logs, or a mock or thread that outlives the test), or allow a third-party message in "testConsole.allow" of nitpicker.config.json. {exception}';

function isLifted(exceptions: readonly unknown[]): (file: string) => boolean {
  const matches = exceptionMatcher(exceptions);
  return (file: string) =>
    matches(CONSOLE_RULE, file) || matches(`${CONSOLE_TOOL}/${CONSOLE_RULE}`, file);
}

function moduleMessages(
  entries: readonly ConsoleEntry[],
  {
    allow,
    exceptions,
    modulePath,
  }: {
    allow: readonly ConsoleAllow[];
    exceptions: readonly unknown[];
    modulePath: string;
  },
): PrintedMessage[] {
  const isAllowed = consoleAllowMatcher(allow);
  const lifted = isLifted(exceptions);
  const found = entries
    .map((entry) => ({ ...entry, file: inModule(modulePath, entry.file) }))
    .filter(({ file }) => !lifted(file))
    .flatMap(({ file, test, messages }) =>
      messages
        .map(normalizeConsoleMessage)
        .filter((message) => message !== '' && !isAllowed(file, message))
        .map((message) => ({ file, test, message })),
    );
  const messages = new Map<string, PrintedMessage>();
  for (const printed of found) {
    messages.set(printed.message, messages.get(printed.message) ?? printed);
  }
  return [...messages.values()];
}

function findingFor({ file, test, message }: PrintedMessage, moduleRoot: string): JavaFinding {
  const where = test === '' ? file : `${file}, test "${test}"`;
  return {
    tool: CONSOLE_TOOL,
    rule: CONSOLE_RULE,
    path: moduleRoot,
    identity: `console:${hash(message)}`,
    message: MESSAGE.replace('{output}', `"${message}" (${where})`).replace(
      '{exception}',
      exceptionHint(CONSOLE_EXCEPTION_RULE, file),
    ),
    classification: 'enforceable',
    ...consoleTokens(message),
  };
}

export function testConsoleFindings(
  entries: readonly ConsoleEntry[],
  options: ConsoleOptions,
): JavaFinding[] {
  const { allow = [], exceptions = [], modulePath = '', moduleRoot = '' } = options;
  return moduleMessages(entries, { allow, exceptions, modulePath })
    .toSorted((left, right) => left.message.localeCompare(right.message))
    .map((found) => findingFor(found, moduleRoot === '' ? '.' : moduleRoot));
}

export function readTestConsoleFindings(
  location: Parameters<typeof readConsoleEntries>[0],
  options: ConsoleOptions,
): JavaFinding[] {
  return testConsoleFindings(readConsoleEntries(location), options);
}
