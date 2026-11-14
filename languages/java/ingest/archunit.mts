import { createIdentityCounter, testCaseProblem } from '../../../shared/ingest/common.mjs';
import { childrenNamed, parseXml, type XmlElement } from '../../../shared/values/xml.mts';
import { textOf } from '../../../shared/values/readers.mts';

const problemOf: (testCase: XmlElement) => { problem: XmlElement } | undefined = testCaseProblem;

interface ArchunitOptions {
  readonly tool?: string;
  readonly resolvePath?: (className: string, fileName: string | undefined) => string | undefined;
}

interface Context {
  readonly tool: string;
  readonly resolvePath: (className: string, fileName: string | undefined) => string | undefined;
  readonly unique: (identity: string) => string;
}

interface Report extends Context {
  readonly rule: string;
  readonly testClass: string;
  readonly testPath: string | undefined;
}

interface Violation {
  count: number;
  sample: string;
  fileName: string | undefined;
}

interface ArchunitFinding {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: 'enforceable';
  readonly symbol?: string;
}

const VIOLATION = /^([A-Z][A-Za-z ]*?) <((?:[^<>]|<\w+>)+)>/;
const SOURCE_REFERENCE = /\s+in \(([^():]+\.(?:java|kt|groovy)):\d+\)\s*$/;
const MEMBER_KINDS = new Set(['Method', 'Field', 'Lambda']);

export function ingestArchunit(
  xml: string,
  options: ArchunitOptions = {},
): { findings: ArchunitFinding[] } {
  const root = parseXml(xml);
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  if (suites.some((suite) => suite.name !== 'testsuite')) {
    throw new TypeError('ArchUnit JUnit report root element must be <testsuite>');
  }
  const context: Context = {
    tool: options.tool ?? 'archunit',
    resolvePath: options.resolvePath ?? (() => undefined),
    unique: createIdentityCounter(),
  };
  return {
    findings: suites.flatMap((suite) =>
      childrenNamed(suite, 'testcase').flatMap((testCase) =>
        testCaseFindings({ suite, testCase }, context),
      ),
    ),
  };
}

function testCaseFindings(
  { suite, testCase }: { suite: XmlElement; testCase: XmlElement },
  context: Context,
): ArchunitFinding[] {
  const failure = problemOf(testCase)?.problem;
  if (failure === undefined) return [];
  const rule = testCase.attrs['name'] || 'archunit';
  const testClass = testCase.attrs['classname'] ?? suite.attrs['name'] ?? '';
  const testPath = context.resolvePath(testClass, undefined);
  const violations = parseViolations(failure.attrs['message'] ?? '');
  const report: Report = { ...context, rule, testClass, testPath };
  if (violations.size === 0) return missingViolationFindings(report);
  return [...violations].flatMap(([className, violation]) =>
    violationFinding(className, violation, report),
  );
}

function missingViolationFindings({
  tool,
  rule,
  testClass,
  testPath,
  unique,
}: Report): ArchunitFinding[] {
  return testPath === undefined
    ? []
    : [
        {
          tool,
          rule,
          path: testPath,
          identity: unique(`${testClass}:test-failure`),
          message: `ArchUnit rule ${rule} failed without reporting violations`,
          classification: 'enforceable',
        },
      ];
}

function violationFinding(
  className: string,
  { count, sample, fileName }: Violation,
  { tool, rule, testPath, resolvePath, unique }: Report,
): ArchunitFinding[] {
  const filePath = resolvePath(className, fileName) ?? testPath;
  return filePath === undefined
    ? []
    : [
        {
          tool,
          rule,
          path: filePath,
          identity: unique(className),
          message: `ArchUnit rule ${rule} violated by ${className} (${String(count)} violation${count === 1 ? '' : 's'}): ${sample}`,
          classification: 'enforceable',
          symbol: className,
        },
      ];
}

function parseViolations(message: string): Map<string, Violation> {
  const violations = new Map<string, Violation>();
  for (const rawLine of message.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = VIOLATION.exec(line);
    if (match === null) {
      continue;
    }
    const className = ownerClass(textOf(match[1]), textOf(match[2]));
    if (className === undefined) {
      continue;
    }
    const reference = SOURCE_REFERENCE.exec(line);
    const entry: Violation = violations.get(className) ?? {
      count: 0,
      sample: line.replace(SOURCE_REFERENCE, ''),
      fileName: undefined,
    };
    entry.count += 1;
    entry.fileName ??= reference?.[1];
    violations.set(className, entry);
  }
  return violations;
}

function ownerClass(kind: string, subject: string): string | undefined {
  const name = textOf(subject.split('(')[0]).replace(/\.<(?:cl)?init>$/, '');
  const owner = MEMBER_KINDS.has(kind) ? name.slice(0, Math.max(0, name.lastIndexOf('.'))) : name;
  return /^[\w$.]+$/.test(owner) ? owner : undefined;
}
