import { childrenNamed, createIdentityCounter, parseXml } from '../../../shared/ingest/common.mjs';

const VIOLATION = /^([A-Z][A-Za-z ]*?) <((?:[^<>]|<\w+>)+)>/;
const SOURCE_REFERENCE = /\s+in \(([^():]+\.java):\d+\)\s*$/;
const MEMBER_KINDS = new Set(['Method', 'Field', 'Lambda']);

export function ingestArchunit(xml, options = {}) {
  const root = parseXml(xml);
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  if (suites.some((suite) => suite.name !== 'testsuite')) {
    throw new TypeError('ArchUnit JUnit report root element must be <testsuite>');
  }
  const context = {
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

function testCaseFindings({ suite, testCase }, context) {
  const failure = [...childrenNamed(testCase, 'failure'), ...childrenNamed(testCase, 'error')][0];
  if (failure === undefined) return [];
  const rule = testCase.attrs.name || 'archunit';
  const testClass = testCase.attrs.classname ?? suite.attrs.name ?? '';
  const testPath = context.resolvePath(testClass, undefined);
  const violations = parseViolations(failure.attrs.message ?? '');
  const report = { ...context, rule, testClass, testPath };
  if (violations.size === 0) return missingViolationFindings(report);
  return [...violations].flatMap(([className, violation]) =>
    violationFinding(className, violation, report),
  );
}

function missingViolationFindings({ tool, rule, testClass, testPath, unique }) {
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
  className,
  { count, sample, fileName },
  { tool, rule, testPath, resolvePath, unique },
) {
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

function parseViolations(message) {
  const violations = new Map();
  for (const rawLine of message.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = VIOLATION.exec(line);
    if (match === null) {
      continue;
    }
    const className = ownerClass(match[1], match[2]);
    if (className === undefined) {
      continue;
    }
    const reference = SOURCE_REFERENCE.exec(line);
    const entry = violations.get(className) ?? {
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

function ownerClass(kind, subject) {
  const name = subject.split('(')[0].replace(/\.<(?:cl)?init>$/, '');
  const owner = MEMBER_KINDS.has(kind) ? name.slice(0, Math.max(0, name.lastIndexOf('.'))) : name;
  return /^[\w$.]+$/.test(owner) ? owner : undefined;
}
