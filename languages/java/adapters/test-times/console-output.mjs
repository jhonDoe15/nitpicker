import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { childrenNamed, parseXml } from '../../ingest/common.mjs';
import { sourceLocator } from '../reporting/kotlin-reports.mjs';
import { pathInside } from '../review-rules/java-sources.mjs';
import { TEST_RESULTS_DIRECTORY } from './slow-tests.mjs';

const REDIRECTED_OUTPUT = /^(.+)-output\.txt$/u;
const LOG_LEVEL = /(?:^|[\s[|])(?:WARN|WARNING|ERROR|FATAL|SEVERE)(?=[\s\]|:])/u;
const STACK_FRAME = /^\s+(?:at\s|\.\.\.\s\d+\s(?:more|common frames omitted))/u;
const TEXT = /[\p{L}\p{N}]/u;
const PARAMETER_LIST = /\((?:[^()]|\([^()]*\))*\)(?:\[\d+\])?$/u;

const JVM_WARNING = /^WARNING: /u;
const SLF4J_NOTICE = /^SLF4J(?:\([A-Z]\))?: /u;

function continues(line, previous) {
  const adjacent = previous !== undefined && TEXT.test(previous);
  return /^\s/u.test(line) || (adjacent && (JVM_WARNING.test(line) || JVM_WARNING.test(previous)));
}

function blocksOf(text) {
  const blocks = [];
  const lines = text.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    if (!TEXT.test(line) || STACK_FRAME.test(line)) {
      continue;
    }
    if (blocks.length > 0 && continues(line, lines[index - 1])) {
      blocks[blocks.length - 1] += ` ${line.trim()}`;
    } else {
      blocks.push(line.trim());
    }
  }
  return blocks.filter((block) => !SLF4J_NOTICE.test(block));
}

export function consoleMessages({ out = '', err = '' }) {
  return [...blocksOf(err), ...blocksOf(out).filter((block) => LOG_LEVEL.test(block))];
}

function streamText(element, name) {
  return childrenNamed(element, name)
    .map((child) => child.text ?? '')
    .join('\n');
}

function streamsOf(element) {
  return { out: streamText(element, 'system-out'), err: streamText(element, 'system-err') };
}

export function consoleEntriesOf(xml) {
  const root = parseXml(xml);
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  return suites.flatMap((suite) => [
    { className: suite.attrs.name ?? '', test: '', messages: consoleMessages(streamsOf(suite)) },
    ...childrenNamed(suite, 'testcase').map((testCase) => ({
      className: testCase.attrs.classname ?? suite.attrs.name ?? '',
      test: (testCase.attrs.name ?? '').replace(PARAMETER_LIST, ''),
      messages: consoleMessages(streamsOf(testCase)),
    })),
  ]);
}

function redirectedEntry(name, text) {
  return {
    className: REDIRECTED_OUTPUT.exec(name)[1],
    test: '',
    messages: consoleMessages({ out: text }),
  };
}

function entriesOf(name, text) {
  return name.endsWith('.xml') ? consoleEntriesOf(text) : [redirectedEntry(name, text)];
}

function readEntries(reportRoot) {
  const resultsRoot = pathInside(reportRoot, TEST_RESULTS_DIRECTORY);
  const tasks = existsSync(resultsRoot) ? readdirSync(resultsRoot).sort() : [];
  return tasks.flatMap((task) => {
    const taskRoot = pathInside(resultsRoot, task);
    return readdirSync(taskRoot)
      .filter((name) => name.endsWith('.xml') || REDIRECTED_OUTPUT.test(name))
      .sort()
      .flatMap((name) => entriesOf(name, readFileSync(pathInside(taskRoot, name), 'utf8')));
  });
}

function sourceOf(locate, className) {
  const parts = className.split('.');
  const simple = parts.pop().split('$')[0];
  const directory = parts.join('/');
  return locate(directory, `${simple}.java`) ?? locate(directory, `${simple}.kt`) ?? '.';
}

export function readConsoleEntries({ reportRoot, projectRoot, testRoots }) {
  const locate = sourceLocator(projectRoot, testRoots);
  return readEntries(reportRoot)
    .filter(({ messages }) => messages.length > 0)
    .map(({ className, test, messages }) => ({
      file: sourceOf(locate, className),
      test,
      messages,
    }));
}
