import { sourceOf as sourceOfUntyped } from './integration-tests.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { childrenNamed, parseXml, type XmlElement } from '../../../../shared/values/xml.mts';
import { sourceLocator as sourceLocatorUntyped } from '../reporting/kotlin-reports.mjs';
import { pathInside as pathInsideUntyped } from '../review-rules/java-sources.mjs';
import { TEST_RESULTS_DIRECTORY } from './slow-tests.mts';
import type { Locate } from './inherited-tests.mts';

type ConsoleEntry = {
  readonly className: string;
  readonly test: string;
  readonly messages: string[];
};

const sourceOf: (locate: Locate, className: string) => string | undefined = sourceOfUntyped;
const sourceLocator: (projectRoot: string, sourceRoots: readonly string[]) => Locate =
  sourceLocatorUntyped;
const pathInside: (base: string, relative: string) => string = pathInsideUntyped;

const REDIRECTED_OUTPUT = /^(.+)-output\.txt$/u;
const LOG_LEVEL = /(?:^|[\s[|])(?:WARN|WARNING|ERROR|FATAL|SEVERE)(?=[\s\]|:])/u;
const STACK_FRAME = /^\s+(?:at\s|\.\.\.\s\d+\s(?:more|common frames omitted))/u;
const TEXT = /[\p{L}\p{N}]/u;
const PARAMETER_LIST = /\((?:[^()]|\([^()]*\))*\)(?:\[\d+\])?$/u;

const JVM_WARNING = /^WARNING: /u;
const SLF4J_NOTICE = /^SLF4J(?:\([A-Z]\))?: /u;

function continues(line: string, previous: string | undefined): boolean {
  const adjacent = previous !== undefined && TEXT.test(previous);
  return /^\s/u.test(line) || (adjacent && (JVM_WARNING.test(line) || JVM_WARNING.test(previous)));
}

function blocksOf(text: string): string[] {
  const blocks: string[] = [];
  const lines = text.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    if (!TEXT.test(line) || STACK_FRAME.test(line)) {
      continue;
    }
    if (blocks.length > 0 && continues(line, lines[index - 1])) {
      blocks.push(`${blocks.pop() ?? ''} ${line.trim()}`);
    } else {
      blocks.push(line.trim());
    }
  }
  return blocks.filter((block) => !SLF4J_NOTICE.test(block));
}

export function consoleMessages({ out = '', err = '' }: { out?: string; err?: string }): string[] {
  return [...blocksOf(err), ...blocksOf(out).filter((block) => LOG_LEVEL.test(block))];
}

function streamText(element: XmlElement, name: string): string {
  return childrenNamed(element, name)
    .map((child) => child.text ?? '')
    .join('\n');
}

function streamsOf(element: XmlElement): { out: string; err: string } {
  return { out: streamText(element, 'system-out'), err: streamText(element, 'system-err') };
}

export function consoleEntriesOf(xml: string): ConsoleEntry[] {
  const root = parseXml(xml);
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  return suites.flatMap((suite) => [
    { className: suite.attrs['name'] ?? '', test: '', messages: consoleMessages(streamsOf(suite)) },
    ...childrenNamed(suite, 'testcase').map((testCase) => ({
      className: testCase.attrs['classname'] ?? suite.attrs['name'] ?? '',
      test: (testCase.attrs['name'] ?? '').replace(PARAMETER_LIST, ''),
      messages: consoleMessages(streamsOf(testCase)),
    })),
  ]);
}

function redirectedEntry(name: string, text: string): ConsoleEntry {
  return {
    className: REDIRECTED_OUTPUT.exec(name)?.[1] ?? '',
    test: '',
    messages: consoleMessages({ out: text }),
  };
}

function entriesOf(name: string, text: string): ConsoleEntry[] {
  return name.endsWith('.xml') ? consoleEntriesOf(text) : [redirectedEntry(name, text)];
}

function readEntries(reportRoot: string): ConsoleEntry[] {
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

export function readConsoleEntries({
  reportRoot,
  projectRoot,
  testRoots,
}: {
  reportRoot: string;
  projectRoot: string;
  testRoots: readonly string[];
}): { file: string; test: string; messages: string[] }[] {
  const locate = sourceLocator(projectRoot, testRoots);
  return readEntries(reportRoot)
    .filter(({ messages }) => messages.length > 0)
    .map(({ className, test, messages }) => ({
      file: sourceOf(locate, className) ?? '.',
      test,
      messages,
    }));
}
