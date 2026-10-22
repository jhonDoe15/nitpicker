import { consoleAllowMatcher } from '../../../../shared/rules/console/console-findings.mjs';
import { normalizeConsoleMessage } from '../../../../shared/rules/console/console-messages.mjs';
import { exceptionHint, exceptionMatcher } from '../../../../shared/rules/exceptions.mjs';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { inModule } from '../../builds/module-path.mjs';
import { readConsoleEntries } from './console-output.mjs';

const CONSOLE_TOOL = 'test-runtime';
const CONSOLE_RULE = 'test-console-output';
export const CONSOLE_EXCEPTION_RULE = `${CONSOLE_TOOL}/${CONSOLE_RULE}`;
const MIN_TOKENS = 3;
const MESSAGE =
  'Tests print new console output: {output}. Fix the cause (for example a warning the code under test now logs, or a mock or thread that outlives the test), or allow a third-party message in "testConsole.allow" of nitpicker.config.json. {exception}';

function isLifted(exceptions) {
  const matches = exceptionMatcher(exceptions);
  return (file) => matches(CONSOLE_RULE, file) || matches(`${CONSOLE_TOOL}/${CONSOLE_RULE}`, file);
}

function moduleMessages(entries, { allow, exceptions, modulePath }) {
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
  const messages = new Map();
  for (const printed of found) {
    messages.set(printed.message, messages.get(printed.message) ?? printed);
  }
  return [...messages.values()];
}

function findingFor({ file, test, message }, moduleRoot) {
  const where = test === '' ? file : `${file}, test "${test}"`;
  const tokens = message.split(' ');
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
    ...(tokens.length < MIN_TOKENS ? {} : { tokens }),
  };
}

export function testConsoleFindings(entries, options) {
  const { allow = [], exceptions = [], modulePath = '', moduleRoot = '' } = options;
  return moduleMessages(entries, { allow, exceptions, modulePath })
    .toSorted((left, right) => left.message.localeCompare(right.message))
    .map((found) => findingFor(found, moduleRoot === '' ? '.' : moduleRoot));
}

export function readTestConsoleFindings(location, options) {
  return testConsoleFindings(readConsoleEntries(location), options);
}
