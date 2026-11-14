import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runJavaDiff } from '../../java-diff.mjs';
import { sourceTextReader } from '../../reporting/function-locator.mjs';
import { withoutUnconstrainedBodies } from '../web/request-body-constraints.mjs';
import { schemaChecked } from '../../../../../core/diff/comparison/test-support/findings-schema-check.mjs';
import { commitBranch, runGitIn } from '../../test-support/gradle-e2e.mjs';
const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const fixture = path.join(
  path.resolve(import.meta.dirname, '..'),
  '..',
  'fixtures',
  'spring-project',
);
const reviewFixture = path.join(
  path.resolve(import.meta.dirname, '..'),
  '..',
  'java-e2e',
  'fixtures',
  'review-rules',
);
const SPRING_RULE = /^(?:Spring|Jpa)/;
const VIOLATION_MARKER = /\/\/ violation: (.*)$/;
const CHECKSTYLE_VERSION = /<checkstyle version="([^"]+)">/;
function javaFiles(root) {
  return readdirSync(root, { recursive: true })
    .filter((name) => name.endsWith('.java'))
    .map((name) => path.join(root, name));
}
function expectedViolations(sourceRoot) {
  return javaFiles(sourceRoot)
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) => {
          const marker = VIOLATION_MARKER.exec(line);
          return marker === null
            ? []
            : marker[1]
                .split(',')
                .map(
                  (rule) =>
                    `${path.relative(sourceRoot, file).split(path.sep).join('/')}:${String(index + 1)} ${rule.trim()}`,
                );
        }),
    )
    .sort();
}
function constrainedBodies(results, sourceRoot) {
  const projectRoot = path.resolve(sourceRoot, '..', '..', '..');
  const findings = results.map((result) => {
    const { artifactLocation, region } = result.locations[0].physicalLocation;
    return {
      tool: 'pmd',
      rule: result.ruleId,
      path: path.relative(projectRoot, new URL(artifactLocation.uri).pathname),
      location: { line: region.startLine, column: region.startColumn },
      result,
    };
  });
  return withoutUnconstrainedBodies(findings, {
    projectRoot,
    roots: [path.relative(projectRoot, sourceRoot)],
    readText: sourceTextReader(projectRoot),
  }).map(({ result }) => result);
}

function reportedViolations(sarifFile, sourceRoot) {
  const [run] = JSON.parse(readFileSync(sarifFile, 'utf8')).runs;
  return constrainedBodies(run.results, sourceRoot)
    .filter((result) => SPRING_RULE.test(result.ruleId))
    .map((result) => {
      const { artifactLocation, region } = result.locations[0].physicalLocation;
      const file = path.relative(sourceRoot, new URL(artifactLocation.uri).pathname);
      return `${file.split(path.sep).join('/')}:${String(region.startLine)} ${result.ruleId}`;
    })
    .sort();
}
const REVIEW_MARKER = /\/\/ violation: ([\w-]+(?:, [\w-]+)*)/u;
const REVIEW_RULES = new Set([
  'FixedSleepInTest',
  'NegativeWaitInTest',
  'FloatEqualityInTest',
  'WeakAssertionInTest',
  'RetryInTest',
  'MockedSubjectInTest',
  'StaticMockOfProjectType',
  'GlobalStateLeakInTest',
  'ServerOrContainerPerTest',
  'SharedTestState',
  'ExhaustiveEnumPredicate',
  'StaticForwardingWrapper',
  'ForwardingMethodAlias',
  'ServiceLocatorLookup',
  'SingularAndPluralMember',
  'timeout-abandons-operation',
  'TriStateBoolean',
  'BooleanFlagParameter',
  'ParameterMutation',
  'CompatibilityShim',
  'LegacyCalendarApi',
  'SwallowedInterrupt',
  'UriCreateDynamic',
  'UnclosedInlineResource',
  'UnquotedRegexValue',
  'PlainTextRegex',
  'RegexPartDefect',
  'BacktrackingRegex',
  'ProcessWaitWithoutTimeout',
  'FutureWithoutException',
  'LogFormatArguments',
  'LogExceptionFirst',
  'RecursiveMapUpdate',
  'DefaultTimeZone',
  'MixedTimeUnits',
  'EpochNarrowedToInt',
  'ClassLoadEffect',
  'LockOrderInversion',
  'InconsistentFieldLocking',
  'SpringUnusedContext',
  'TaskOutlivesTryResource',
  'ReactorBlockingInOperator',
  'ReactorBlockInReactiveMethod',
  'ReactorBlockWithoutTimeout',
  'UnboundedWait',
  'SpringProxySelfCall',
  'SpringProxyMethodVisibility',
  'TestClassWithoutTestCases',
  'test-only-export',
  'UnboundedFanOut',
  'UnboundedReactiveFanOut',
  'UnboundedThreadPool',
  'SpringUnreleasedResource',
  'SpringStartupCleanup',
  'HttpWithoutTimeout',
  'UnorderedQuery',
  'UnboundedQueryArray',
  'ConfigurationReadOutsideCompositionRoot',
  'SpringNullOnlyConfigCheck',
  'ListUsedAsSet',
  'LinearLookupInLoop',
  'SortForExtreme',
  'RedundantStreamStep',
  'StreamedRowsCollected',
  'SpringDataFilterInQuery',
  'HardcodedSecret',
  'CredentialLiteral',
  'SecretInLog',
  'CleanupSkippedOnFailure',
  'PendingFuturesNotFailedOnClose',
  'TimerNotStoppedOnClose',
  'CachedFutureKeepsFailure',
  'UnboundedCollectionField',
  'GeneratedMemberCycle',
  'GeneratedEqualsSkipsSuperclass',
]);
const roots = [];
const RECEIPT_TEST_FILE = 'src/test/java/shop/ReceiptTest.java';
const RECEIPT_CONSOLE_FINDING = {
  tool: 'test-runtime',
  rule: 'test-console-output',
  path: '.',
  identity: 'console:a5705cd8f80bae4111f91e91',
  message: [
    'Tests print new console output: "receipt total drifted by <n> cents"',
    `(${RECEIPT_TEST_FILE}, test "printsTheDrift").`,
    'Fix the cause (for example a warning the code under test now logs, or a mock or thread that outlives the test),',
    'or allow a third-party message in "testConsole.allow" of nitpicker.config.json. If this is intended, add',
    `{"rule":"test-runtime/test-console-output","paths":["${RECEIPT_TEST_FILE}"],"reason":"..."}`,
    'to "exceptions" in nitpicker.config.json.',
  ].join(' '),
  classification: 'enforceable',
  tokens: ['receipt', 'total', 'drifted', 'by', '<n>', 'cents'],
  exception: {
    rule: 'test-runtime/test-console-output',
    paths: [RECEIPT_TEST_FILE],
    reason: '...',
  },
  exceptionList: 'exceptions',
};
const RECEIPT_TEST = `package shop;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class ReceiptTest {
  @Test
  void printsTheDrift() {
    System.err.println("receipt total drifted by 3 cents");
    assertThat(Prices.sum(List.of(1L, 2L))).isEqualTo(3L);
  }
}
`;
function copyWithout(...left) {
  const root = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-review-rules-')), 'shop');
  roots.push(path.dirname(root));
  cpSync(reviewFixture, root, { recursive: true });
  for (const name of left) {
    rmSync(path.join(root, name));
  }
  return root;
}
function markedReviewViolations(root) {
  return readdirSync(path.join(root, 'src'), { recursive: true })
    .filter((name) => name.endsWith('.java'))
    .flatMap((name) =>
      readFileSync(path.join(root, 'src', name), 'utf8')
        .split('\n')
        .flatMap((line, index) => {
          const rules = REVIEW_MARKER.exec(line)?.[1].split(', ') ?? [];
          return rules.map((rule) => `src/${name}:${String(index + 1)} ${rule}`);
        }),
    )
    .sort();
}
function reviewFindings(findings) {
  return findings.filter((finding) => REVIEW_RULES.has(finding.rule));
}
function located(findings) {
  return findings
    .filter(({ tool }) => tool === 'pmd')
    .map(({ rule, path: file, location }) => `${file}:${String(location.line)} ${rule}`)
    .sort();
}
function comparable(findings) {
  return findings.map((finding) => JSON.stringify(finding)).sort();
}
function stableConsoleEmitters(findings) {
  return findings.map((finding) => {
    if (finding.rule !== 'test-console-output') {
      return finding;
    }
    const file = / \(([^,)]+)(?:, test "[^"]*")?\)(?=\. Fix the cause)/u.exec(finding.message)?.[1];
    if (file === undefined) {
      return finding;
    }
    const exception = finding.exception && {
      ...finding.exception,
      paths: finding.exception.paths.map((entry) => (entry === file ? '<emitting source>' : entry)),
    };
    return {
      ...finding,
      ...(exception && { exception }),
      message: finding.message
        .replaceAll(file, '<emitting source>')
        .replace(/, test "[^"]*"/u, ', test "<emitting test>"'),
    };
  });
}
function consoleChange(build, ...left) {
  const repository = copyWithout(...left);
  runGitIn(repository, 'init', '-q', '-b', 'main');
  runGitIn(repository, 'add', '-A');
  runGitIn(repository, 'commit', '-q', '-m', 'base');
  const filterTest = path.join(repository, 'src/test/java/shop/FilterTest.java');
  commitBranch(repository, 'receipt', {
    [RECEIPT_TEST_FILE]: RECEIPT_TEST,
    'src/test/java/shop/FilterTest.java': readFileSync(filterTest, 'utf8').replace('42', '43'),
  });
  const result = schemaChecked(
    runJavaDiff({ repositoryRoot: repository, requestedBaseRef: 'main', ...build }),
  );
  return result.newFindings.filter(({ rule }) => rule === 'test-console-output');
}
export {
  enabled,
  gradle,
  maven,
  fixture,
  CHECKSTYLE_VERSION,
  expectedViolations,
  reportedViolations,
  roots,
  copyWithout,
  markedReviewViolations,
  reviewFindings,
  located,
  comparable,
  stableConsoleEmitters,
  consoleChange,
  RECEIPT_CONSOLE_FINDING,
};
