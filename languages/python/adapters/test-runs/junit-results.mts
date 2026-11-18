import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { type XmlElement, childrenNamed, parseXml } from '../../../../shared/values/xml.mts';
import type { JunitFailure, JunitTestCase } from './typed/run-types.mts';

export const JUNIT_REPORT = 'pytest-junit.xml';
export const RERUN_REPORT = 'rerun-junit.xml';
const FAILED_CHILDREN = ['failure', 'error'];
const PARAMETERS = /\[.*\]$/su;
const MARKS_PROPERTY = 'nitpicker_marks';

function moduleFile(dotted: string): string {
  return `${dotted.replaceAll('.', '/')}.py`;
}

function outcomeOf(testCase: XmlElement): string {
  if (FAILED_CHILDREN.some((name) => childrenNamed(testCase, name).length > 0)) {
    return 'failed';
  }
  return childrenNamed(testCase, 'skipped').length > 0 ? 'skipped' : 'passed';
}

function owner(file: string, classname: string): string {
  const dotted = file.replace(/\.py$/u, '').replaceAll('/', '.');
  const index = classname.indexOf(dotted);
  return index === -1 ? '' : classname.slice(index + dotted.length).replace(/^\./u, '');
}

function marksOf(testCase: XmlElement): { marks?: string[] } {
  const property = childrenNamed(testCase, 'properties')
    .flatMap((properties) => childrenNamed(properties, 'property'))
    .find(({ attrs }) => attrs['name'] === MARKS_PROPERTY);
  return property === undefined
    ? {}
    : {
        marks: (property.attrs['value'] ?? '').split(' ').filter(Boolean),
      };
}

const LONGREPR_LOCATION = /^(?<file>[^:\n]+\.py):(?<line>\d+): /gmu;

function failureOf(testCase: XmlElement, file: string): { failure?: JunitFailure } {
  const [problem] = FAILED_CHILDREN.flatMap((name) => childrenNamed(testCase, name));
  if (problem === undefined) {
    return {};
  }
  const lines = [...(problem.text ?? '').matchAll(LONGREPR_LOCATION)]
    .filter(({ groups }) => groups?.['file']?.replaceAll('\\', '/') === file)
    .map(({ groups }) => Number(groups?.['line']));
  const message = (problem.attrs['message'] ?? '').split('\n').find((line) => line.trim() !== '');
  return {
    failure: {
      ...(lines.length === 0 ? {} : { line: lines.at(-1) }),
      ...(message === undefined ? {} : { message: message.trim() }),
    },
  };
}

function testCaseOf(testCase: XmlElement): JunitTestCase {
  const { classname = '', name = '', file, line, time } = testCase.attrs;
  const collection = classname === '' && file === undefined;
  const relative = (file ?? (collection ? moduleFile(name) : '')).replaceAll('\\', '/');
  const className = owner(relative, classname);
  const test = classname === '' ? undefined : name;
  return {
    file: relative,
    qualifiedClass: classname,
    ...(testCase.attrs['unittest_id'] === undefined
      ? {}
      : { runtimeId: testCase.attrs['unittest_id'] }),
    ...marksOf(testCase),
    line: line === undefined ? undefined : Number(line) + 1,
    className,
    name: test,
    functionName: test?.replace(PARAMETERS, ''),
    id: [relative, ...(className === '' ? [] : className.split('.')), ...(test ? [test] : [])].join(
      '::',
    ),
    seconds: Number((time ?? '0').replaceAll(',', '')),
    outcome: outcomeOf(testCase),
    ...failureOf(testCase, relative),
  };
}

export function parseJunit(xml: string): JunitTestCase[] {
  const root = parseXml(xml);
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  return suites.flatMap((suite) => childrenNamed(suite, 'testcase').map(testCaseOf));
}

export function readJunit(reportRoot: string, name: string = JUNIT_REPORT): JunitTestCase[] {
  const base = path.resolve(reportRoot);
  const report = path.resolve(base, name);
  if (!report.startsWith(base + path.sep)) {
    throw new Error(`JUnit report path escapes the report directory: ${name}`);
  }
  return existsSync(report) ? parseJunit(readFileSync(report, 'utf8')) : [];
}

export function failedTests(cases: readonly JunitTestCase[]): JunitTestCase[] {
  return cases.filter(({ outcome }) => outcome === 'failed');
}

export function failingModules(cases: readonly JunitTestCase[]): string[] {
  return [...new Set(failedTests(cases).map(({ file }) => file))].filter(Boolean).sort();
}
