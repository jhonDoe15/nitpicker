import { childrenNamed, createIdentityCounter, parseXml } from './common.mjs';

const VIOLATION = /^([A-Z][A-Za-z ]*?) <((?:[^<>]|<\w+>)+)>/;
const SOURCE_REFERENCE = /\s+in \(([^():]+\.java):\d+\)\s*$/;
const MEMBER_KINDS = new Set(['Method', 'Field', 'Lambda']);

export function ingestArchunit(xml, options = {}) {
  const root = parseXml(xml);
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  if (suites.some((suite) => suite.name !== 'testsuite')) {
    throw new TypeError('ArchUnit JUnit report root element must be <testsuite>');
  }
  const tool = options.tool ?? 'archunit';
  const resolvePath = options.resolvePath ?? (() => undefined);
  const unique = createIdentityCounter();
  const findings = [];
  for (const suite of suites) {
    for (const testCase of childrenNamed(suite, 'testcase')) {
      const failure = [
        ...childrenNamed(testCase, 'failure'),
        ...childrenNamed(testCase, 'error'),
      ][0];
      if (failure === undefined) {
        continue;
      }
      const rule = testCase.attrs.name || 'archunit';
      const testClass = testCase.attrs.classname ?? suite.attrs.name ?? '';
      const testPath = resolvePath(testClass, undefined);
      const violations = parseViolations(failure.attrs.message ?? '');
      if (violations.size === 0) {
        if (testPath !== undefined) {
          findings.push({
            tool,
            rule,
            path: testPath,
            identity: unique(`${testClass}:test-failure`),
            message: `ArchUnit rule ${rule} failed without reporting violations`,
            classification: 'enforceable',
          });
        }
        continue;
      }
      for (const [className, { count, sample, fileName }] of violations) {
        const filePath = resolvePath(className, fileName) ?? testPath;
        if (filePath === undefined) {
          continue;
        }
        findings.push({
          tool,
          rule,
          path: filePath,
          identity: unique(className),
          message: `ArchUnit rule ${rule} violated by ${className} (${String(count)} violation${count === 1 ? '' : 's'}): ${sample}`,
          classification: 'enforceable',
          symbol: className,
        });
      }
    }
  }
  return { findings };
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
