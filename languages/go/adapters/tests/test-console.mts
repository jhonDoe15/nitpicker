import { packageDirectory, testFunction } from './go-slow-tests.mts';
import type { GoConsoleFact, NamedTests, TestRun } from '../go-types.mts';

const FRAMING =
  /^(?:=== (?:RUN|PAUSE|CONT|NAME|ATTR)\b|--- (?:PASS|FAIL|SKIP)\b|PASS$|FAIL\b|ok\s|coverage:)/u;
const INDENTED = /^\s/u;
const DATA_RACE = /^WARNING: DATA RACE$/u;
const WARNING_WORD =
  /(?:^|[\s[|])(?:WARN|WARNING|ERROR|FATAL|SEVERE|PANIC|CRITICAL)(?=[\s\]|:]|$)/u;
const WARNING_FIELD =
  /(?:^|[\s{,])"?level"?\s*[=:]\s*"?(?:warn|warning|error|fatal|panic|dpanic|critical)\b/iu;
const LOWER_LEVEL_WORD = /^\[?(?:trace|debug|info|notice)(?:\]|:|\s|$)/iu;
const LEVEL_FIELD = /(?:^|[\s{,])"?level"?\s*[=:]/iu;
const STANDARD_LOG = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)? /u;
const KLOG = /^([IWEF])\d{4} \d{2}:\d{2}:\d{2}\.\d{6}\s+\d+ \S+:\d+\] /u;
const KLOG_INFO = 'I';

function leveledWarning(line: string) {
  if (LEVEL_FIELD.test(line)) {
    return WARNING_FIELD.test(line);
  }
  const klog = KLOG.exec(line);
  if (klog !== null) {
    return klog[1] !== KLOG_INFO;
  }
  const rest = line.replace(STANDARD_LOG, '');
  if (LOWER_LEVEL_WORD.test(rest)) {
    return false;
  }
  return rest !== line || WARNING_WORD.test(line);
}

function counts(line: string) {
  return (
    !FRAMING.test(line) && !INDENTED.test(line) && !DATA_RACE.test(line) && leveledWarning(line)
  );
}

export function consoleMessages(output: string): string[] {
  return output
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '' && counts(line))
    .map((line) => line.replace(STANDARD_LOG, '').trim());
}

function folderOf(directory: string | undefined) {
  return directory === undefined || directory === '.' ? '' : directory;
}

function testFile(report: Partial<NamedTests>, directory: string | undefined, test: string) {
  const [name = ''] = test.split('/');
  return name === '' || directory === undefined
    ? undefined
    : testFunction(report.tests ?? [], directory, name)?.file;
}

export function goConsoleFacts(
  testRun: Pick<TestRun, 'outputs'>,
  { report, module }: { report: Partial<NamedTests>; module: string },
): GoConsoleFact[] {
  return testRun.outputs.flatMap(({ package: packageName, test, output }) => {
    const messages = consoleMessages(output);
    if (messages.length === 0) {
      return [];
    }
    const directory = module === '' ? undefined : packageDirectory(module, packageName);
    return [{ file: testFile(report, directory, test) ?? folderOf(directory), test, messages }];
  });
}
