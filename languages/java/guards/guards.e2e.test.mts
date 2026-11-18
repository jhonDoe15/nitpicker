import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../builds/java-build.mts';
import { runJavaDuplicates, readDuplicateFindings } from '../adapters/metrics/java-duplicates.mts';
import {
  readReportModules,
  readMainCheckstyle,
} from '../adapters/gradle-reports/report-modules.mts';
import { ingestSarif, prepareSarif } from '../../../shared/ingest/sarif.mjs';
import { checkstyleFindings } from '../adapters/reporting/format-findings.mts';
import { sourceLocator } from '../adapters/reporting/kotlin-reports.mts';
import { applyRuleMessages } from '../messages/rule-messages.mts';
import { readGuardFindings } from './index.mts';
import { coveredByCpd } from './cpd-duplicates.mts';
import { readCouplingFindings } from '../adapters/metrics/java-coupling.mts';
import { readErrorProneFindings } from '../adapters/errorprone/java-errorprone.mts';
import { readCpdFindings } from './cpd-duplicates.mts';
import { readLintFindings } from './javac-lint.mts';
import { exceptionHint } from '../../../shared/rules/exceptions.mjs';
import { fieldOf, listOf, parseJson, textOf, textsOf } from '../../../shared/values/readers.mts';
import { callUntyped } from '../adapters/typed/java-values.mts';

type GuardRow = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly classification: string;
  readonly message: string;
  readonly location: unknown;
};

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const fixtures = path.join(import.meta.dirname, '..', 'adapters', 'fixtures');
const untypedHint: (rule: string, file: string) => string = exceptionHint;

function optionalGetMessage(file: string): string {
  return (
    'Use orElseThrow(), orElse(...), map or ifPresent instead of Optional.get(). ' +
    untypedHint('pmd/OptionalGet', file)
  );
}

function rowOf(finding: unknown): GuardRow {
  return {
    tool: textOf(fieldOf(finding, 'tool')),
    rule: textOf(fieldOf(finding, 'rule')),
    path: textOf(fieldOf(finding, 'path')),
    classification: textOf(fieldOf(finding, 'classification')),
    message: textOf(fieldOf(finding, 'message')),
    location: fieldOf(finding, 'location'),
  };
}

function lineLabel(finding: unknown): string {
  const location = fieldOf(finding, 'location');
  return `${textOf(fieldOf(finding, 'path'))}:${String(fieldOf(location, 'line'))} ${textOf(fieldOf(finding, 'rule'))}`;
}
const LINE_MARKER = /\/\/ violation: (.*)$/;
const FILE_MARKER = /\/\/ file violation: (.*)$/;
const UNRELATED_TASKS = [
  'nitpickerSpotbugs',
  'nitpickerErrorProne',
  'nitpickerFormat',
  'nitpickerJacoco',
  'nitpickerArchunit',
  'nitpickerStructure',
  'nitpickerPit',
  'test',
];
const GUARD_TOOLS = new Set(['javac', 'forbiddenapis', 'dependencies', 'coupling', 'duplicates']);
const GUARD_RULES = new Set([
  'OptionalGet',
  'OptionalAsFieldOrParameter',
  'OptionalOfCollection',
  'InstanceofThenCast',
  'SneakyThrows',
  'CollectorsToList',
  'StreamResourceNotClosed',
  'ForEachSideEffect',
  'SqlConcatenation',
  'WeakHash',
  'NestedQuantifierRegex',
  'PathFromParameter',
  'SignatureDeclareThrowsException',
  'AvoidThrowingRawExceptionTypes',
  'MutableStaticCollection',
  'DisabledTest',
  'AssertionInControlFlow',
  'TryCatchInTest',
  'TautologicalAssertion',
  'AlwaysFailingAssertion',
  'MockedValueType',
  'TestOrderDependence',
  'DroppedCallbackInTest',
  'MessageAfterAssertion',
  'TestClassWithoutTestCases',
  'ConstantName',
  'MagicNumber',
  'VisibilityModifier',
  'ExhaustiveSwitchHasDefault',
  'UnnecessaryWarningSuppression',
]);

function markedFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map((name) => name.split(path.sep).join('/'))
    .filter((name) => name.startsWith('src/') || name === 'build.gradle')
    .filter((name) => name.endsWith('.java') || name.endsWith('.gradle'));
}

function markers(line: string, pattern: RegExp): string[] {
  const marker = pattern.exec(line);
  return marker === null ? [] : (marker[1] ?? '').split(',').map((rule) => rule.trim());
}

function expectedViolations(root: string): string[] {
  return markedFiles(root)
    .flatMap((file) =>
      readFileSync(path.join(root, file), 'utf8')
        .split('\n')
        .flatMap((line, index) => [
          ...markers(line, LINE_MARKER).map((rule) => `${file}:${String(index + 1)} ${rule}`),
          ...markers(line, FILE_MARKER).map((rule) => `${file} ${rule}`),
        ]),
    )
    .sort((left, right) => left.localeCompare(right));
}

function isGuard({ tool, rule, classification }: GuardRow): boolean {
  return (
    classification === 'enforceable' &&
    tool !== 'errorprone' &&
    (GUARD_TOOLS.has(tool) || GUARD_RULES.has(rule)) &&
    !(tool === 'coupling' && rule !== 'package-cycle') &&
    !(tool === 'duplicates' && rule !== 'duplicate-clone')
  );
}

function reportBaseOf(root: string): string {
  return path.join(path.dirname(root), 'reports');
}

function guardFindings(root: string): GuardRow[] {
  const reportBase = reportBaseOf(root);
  const reported = callUntyped(readReportModules, reportBase, 'java');
  const modules = listOf(fieldOf(reported, 'modules'));
  const manifest = fieldOf(reported, 'manifest');
  const applied = callUntyped(
    applyRuleMessages,
    [
      ...modules.flatMap((module) => moduleGuardFindings(root, module)),
      ...listOf(
        callUntyped(readDuplicateFindings, reportBase, {
          projectRoot: root,
          skip: callUntyped(coveredByCpd, modules, root),
        }),
      ),
    ],
    { testRoots: fieldOf(manifest, 'testSourceRoots') },
  );
  return listOf(applied).map(rowOf);
}

function moduleGuardFindings(projectRoot: string, module: unknown): unknown[] {
  const manifest = fieldOf(module, 'manifest');
  const reportRoot = textOf(fieldOf(module, 'reportRoot'));
  const context = {
    projectRoot,
    reportRoot,
    roots: [projectRoot],
    manifest,
    sourceRoots: textsOf(fieldOf(manifest, 'sourceRoots')),
    module: { moduleDir: fieldOf(module, 'dir') },
    locate: callUntyped(sourceLocator, projectRoot, [
      ...textsOf(fieldOf(manifest, 'sourceRoots')),
      ...textsOf(fieldOf(manifest, 'testSourceRoots')),
    ]),
    mainCheckstyle: callUntyped(readMainCheckstyle, projectRoot, module, 'java'),
  };
  const pmd = callUntyped(
    prepareSarif,
    parseJson(readFileSync(path.join(reportRoot, 'pmd.sarif'), 'utf8')),
    {
      ...context,
      identityKey: (result: unknown) => fieldOf(fieldOf(result, 'message'), 'text'),
    },
  );
  return [
    ...listOf(fieldOf(callUntyped(ingestSarif, pmd, { tool: 'pmd' }), 'findings')),
    ...listOf(callUntyped(checkstyleFindings, context)),
    ...readGuardFindings(context),
    ...listOf(callUntyped(readCouplingFindings, reportRoot, context)),
  ];
}

function reportedViolations(root: string): string[] {
  return guardFindings(root)
    .filter((finding) => isGuard(finding))
    .map(({ tool, rule, path: file, location }) =>
      location === undefined
        ? `${file} ${tool}/${rule}`
        : `${file}:${String(fieldOf(location, 'line'))} ${tool}/${rule}`,
    )
    .sort((left, right) => left.localeCompare(right));
}

function runGradle(projectRoot: string, args: string[]): void {
  const result = spawnSync(
    gradle,
    ['--console=plain', '--quiet', '--no-configuration-cache', '-I', INIT_SCRIPT, ...args],
    { cwd: projectRoot, encoding: 'utf8', timeout: 90_000 },
  );
  if (result.status !== 0) {
    throw new Error(
      `Gradle failed (status=${String(result.status)}, signal=${String(result.signal)}): ` +
        `${result.error?.message ?? ''}\n${result.stderr || result.stdout}`,
      { cause: result.error },
    );
  }
}

function gradleTasks(
  fixture: string,
  tasks: string[],
  properties: (root: string) => string[] = () => [],
): string {
  const projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-guards-')), fixture);
  cpSync(path.join(fixtures, fixture), projectRoot, { recursive: true });
  runGradle(projectRoot, [...properties(projectRoot), ...tasks]);
  return projectRoot;
}

function pmdRules(projectRoot: string): string[] {
  const sarif = parseJson(
    readFileSync(path.join(projectRoot, 'build', 'nitpicker', 'pmd.sarif'), 'utf8'),
  );
  return [
    ...new Set(
      listOf(fieldOf(sarif, 'runs')).flatMap((run) =>
        listOf(fieldOf(run, 'results')).map((result) => textOf(fieldOf(result, 'ruleId'))),
      ),
    ),
  ];
}

describe.skipIf(!enabled)('Java guards on a fixture project', () => {
  const roots: string[] = [];
  let guardsRoot: string;
  let modesRoot: string;

  beforeAll(() => {
    guardsRoot = gradleTasks(
      'guards-project',
      ['nitpickerJava', ...UNRELATED_TASKS.flatMap((task) => ['-x', task])],
      (root) => [`-Pnitpicker.reportDir=${reportBaseOf(root)}`],
    );
    const manifest = fieldOf(
      callUntyped(readReportModules, reportBaseOf(guardsRoot), 'java'),
      'manifest',
    );
    callUntyped(runJavaDuplicates, guardsRoot, { reportRoot: reportBaseOf(guardsRoot), manifest });
    modesRoot = gradleTasks('guards-compile-modes', [
      'nitpickerLint',
      ':legacy:nitpickerPmd',
      ':arguments:nitpickerPmd',
      ':modular:nitpickerJdeps',
      ':modular:nitpickerErrorProne',
      ':legacy:nitpickerCpd',
    ]);
    roots.push(guardsRoot, modesRoot);
  }, 120_000);

  afterAll(() => {
    for (const root of roots) {
      rmSync(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('reports exactly the guard violations marked in the fixture, and none on the clean samples', () => {
    expect(reportedViolations(guardsRoot)).toEqual(expectedViolations(guardsRoot));
  });

  it('ends a guard message with its exception route', () => {
    const optionalGet = guardFindings(guardsRoot).find((finding) => finding.rule === 'OptionalGet');

    expect(optionalGet?.message).toBe(optionalGetMessage(optionalGet?.path ?? ''));
  });

  it.each(['legacy', 'arguments'])(
    'skips the Java 16 rules on a project compiled for an older release (%s)',
    (module) => {
      const watched = ['OptionalGet', 'InstanceofThenCast', 'CollectorsToList'];

      expect(
        pmdRules(path.join(modesRoot, module)).filter((rule) => watched.includes(rule)),
      ).toEqual(['OptionalGet']);
    },
  );

  it('lints projects with a javac plug-in, preview, a descriptor, an outside source root or Lombok', () => {
    function lint(module: string): string[] {
      return readLintFindings(path.join(modesRoot, module, 'build', 'nitpicker'), {
        projectRoot: modesRoot,
      }).map(lineLabel);
    }

    expect(
      ['plugged', 'preview', 'modular', 'outside', 'lombok'].flatMap((module) => lint(module)),
    ).toEqual([
      'plugged/src/main/java/plugged/Names.java:7 rawtypes',
      'preview/src/main/java/preview/Names.java:7 rawtypes',
      'modular/src/main/java/modular/shapes/Shape.java:10 rawtypes',
      'outside/src/main/java/outside/Names.java:7 rawtypes',
      'lombok/src/main/java/fluent/Item.java:18 rawtypes',
    ]);
  });

  it('reads the coupling of a module whose descriptor requires a jar module', () => {
    const findings = listOf(
      callUntyped(readCouplingFindings, path.join(modesRoot, 'modular', 'build', 'nitpicker'), {
        projectRoot: modesRoot,
        sourceRoots: ['modular/src/main/java'],
      }),
    );

    expect(
      findings
        .filter((finding) => textOf(fieldOf(finding, 'path')).startsWith('modular/'))
        .map((finding) => {
          const metric = fieldOf(finding, 'metric');
          return `${textOf(fieldOf(finding, 'path'))} ${textOf(fieldOf(metric, 'name'))} ${String(fieldOf(metric, 'value'))}`;
        }),
    ).toEqual(
      [
        'Labels.java fanIn 0',
        'Labels.java fanOut 1',
        'Labels.java totalCoupling 1',
        'Labels.java instability 1',
        'Shape.java fanIn 3',
        'Shape.java fanOut 2',
        'Shape.java totalCoupling 5',
        'Shape.java instability 0.4',
        'impl/Circle.java fanIn 1',
        'impl/Circle.java fanOut 1',
        'impl/Circle.java totalCoupling 2',
        'impl/Circle.java instability 0.5',
        'impl/Square.java fanIn 1',
        'impl/Square.java fanOut 1',
        'impl/Square.java totalCoupling 2',
        'impl/Square.java instability 0.5',
      ].map((line) => `modular/src/main/java/modular/shapes/${line}`),
    );
  });

  it('runs Error Prone on a module whose sealed interface permits classes in another package', () => {
    const module = path.join(modesRoot, 'modular');
    const reportRoot = path.join(module, 'build', 'nitpicker');
    const lines = readFileSync(path.join(reportRoot, 'errorprone', 'main.args'), 'utf8').split(
      '\n',
    );
    const modulePath = lines[lines.indexOf('--module-path') + 1] ?? '';

    expect(lines).toContain(path.join(module, 'src', 'main', 'java', 'module-info.java'));
    expect(modulePath.split(path.delimiter).map((entry) => path.basename(entry))).toEqual([
      'commons-lang3-3.17.0.jar',
    ]);
    expect(
      listOf(
        callUntyped(readErrorProneFindings, {
          reportRoot,
          roots: [modesRoot],
          lintedRoots: ['modular/src/main/java'],
        }),
      ).map(lineLabel),
    ).toEqual([]);
  });

  it('runs CPD over class literals followed by a declaration without modifiers', () => {
    const reportRoot = path.join(modesRoot, 'legacy', 'build', 'nitpicker');

    expect(
      readCpdFindings(reportRoot, {
        projectRoot: modesRoot,
        sourceRoots: ['legacy/src/main/java'],
        testRoots: [],
      }),
    ).toEqual([]);
    expect(
      ['cpd.xml', 'cpd-failed.txt'].map((name) => existsSync(path.join(reportRoot, name))),
    ).toEqual([true, false]);
  });

  it('leaves symbolic links in a modular class directory out of the jdeps class list and copy', () => {
    const module = path.join(modesRoot, 'modular');
    const classes = path.join(module, 'build', 'classes', 'java', 'main');
    const outside = path.join(path.dirname(modesRoot), 'outside');
    const labels = path.join(classes, 'modular', 'shapes', 'Labels.class');
    mkdirSync(path.join(outside, 'q'), { recursive: true });
    cpSync(labels, path.join(outside, 'B.class'));
    cpSync(labels, path.join(outside, 'q', 'C.class'));
    symlinkSync(path.join(outside, 'B.class'), path.join(classes, 'modular', 'shapes', 'L.class'));
    symlinkSync(path.join(outside, 'q'), path.join(classes, 'linked'));

    runGradle(modesRoot, [':modular:nitpickerJdeps', '-x', 'compileJava']);

    expect(readFileSync(path.join(module, 'build', 'nitpicker', 'jdeps-classes.txt'), 'utf8')).toBe(
      [
        'modular.shapes.Labels',
        'modular.shapes.Shape',
        'modular.shapes.impl.Circle',
        'modular.shapes.impl.Square',
      ]
        .map((name) => `${name}\n`)
        .join(''),
    );
  });
});
