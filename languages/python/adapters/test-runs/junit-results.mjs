import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { childrenNamed, parseXml } from '../../../java/ingest/common.mjs';

export const JUNIT_REPORT = 'pytest-junit.xml';
const FAILED_CHILDREN = ['failure', 'error'];
const PARAMETERS = /\[.*\]$/su;
const MARKS_PROPERTY = 'nitpicker_marks';

function moduleFile(dotted) {
  return `${dotted.replaceAll('.', '/')}.py`;
}

function outcomeOf(testCase) {
  if (FAILED_CHILDREN.some((name) => childrenNamed(testCase, name).length > 0)) {
    return 'failed';
  }
  return childrenNamed(testCase, 'skipped').length > 0 ? 'skipped' : 'passed';
}

function owner(file, classname) {
  const dotted = file.replace(/\.py$/u, '').replaceAll('/', '.');
  const index = classname.indexOf(dotted);
  return index === -1 ? '' : classname.slice(index + dotted.length).replace(/^\./u, '');
}

function marksOf(testCase) {
  const property = childrenNamed(testCase, 'properties')
    .flatMap((properties) => childrenNamed(properties, 'property'))
    .find(({ attrs }) => attrs.name === MARKS_PROPERTY);
  return property === undefined
    ? {}
    : {
        marks: String(property.attrs.value ?? '')
          .split(' ')
          .filter(Boolean),
      };
}

function testCaseOf(testCase) {
  const { classname = '', name = '', file, line, time } = testCase.attrs;
  const collection = classname === '' && file === undefined;
  const relative = (file ?? (collection ? moduleFile(name) : '')).replaceAll('\\', '/');
  const className = owner(relative, classname);
  const test = classname === '' ? undefined : name;
  return {
    file: relative,
    qualifiedClass: classname,
    ...marksOf(testCase),
    line: line === undefined ? undefined : Number(line) + 1,
    className,
    name: test,
    functionName: test?.replace(PARAMETERS, ''),
    id: [relative, ...(className === '' ? [] : className.split('.')), ...(test ? [test] : [])].join(
      '::',
    ),
    seconds: Number(String(time ?? '0').replaceAll(',', '')),
    outcome: outcomeOf(testCase),
  };
}

export function parseJunit(xml) {
  const root = parseXml(xml);
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  return suites.flatMap((suite) => childrenNamed(suite, 'testcase').map(testCaseOf));
}

export function readJunit(reportRoot) {
  const report = path.join(reportRoot, JUNIT_REPORT);
  return existsSync(report) ? parseJunit(readFileSync(report, 'utf8')) : [];
}

export function failedTests(cases) {
  return cases.filter(({ outcome }) => outcome === 'failed');
}

export function failingModules(cases) {
  return [...new Set(failedTests(cases).map(({ file }) => file))].filter(Boolean).sort();
}
