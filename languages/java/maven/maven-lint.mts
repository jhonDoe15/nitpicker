import { writeGuardRulesets } from '../builds/rulesets/pmd-rulesets.mjs';
import { guardCompiler } from './errorprone/maven-compiler.mts';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from './programs/java-command.mts';
import { type SourceModule, compilerOf } from './errorprone/compiler-types.mts';
import { writeRulesets } from '../adapters/tool-config/pmd-wrappers.mjs';
import { NITPICKER_RULESET } from '../adapters/tool-config/layer-files.mjs';
import {
  NITPICKER_SPOTBUGS,
  spotbugsArguments,
} from '../adapters/tool-config/declared/spotbugs-declared.mjs';
import { type JavaSpawn, callUntyped } from '../adapters/typed/java-values.mts';
import { fieldOf, textsOf } from '../../../shared/values/readers.mts';
import type { Classpaths } from './typed/maven-values.mts';
import type { ToolClasspaths } from './typed/kotlin-types.mts';
import { javaFiles } from './lint/java-files.mts';

export { javaFiles } from './lint/java-files.mts';
export { runCheckstyle, writeCheckstyleSetup } from './lint/maven-checkstyle.mts';

type Execution = {
  readonly reportDir: string;
  readonly tools: ToolClasspaths;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: number | undefined;
};
type PmdOptions = Execution & {
  readonly module: SourceModule;
  readonly classpaths: Pick<Classpaths, 'mainCompile' | 'testCompile'>;
  readonly configs: unknown;
  readonly spring: unknown;
  readonly springRules?: unknown;
  readonly reactor?: unknown;
};
type SpotbugsOptions = Execution & {
  readonly module: SourceModule;
  readonly configs: unknown;
  readonly auxClasspath?: readonly string[];
};

const EMPTY_SARIF = '{"version":"2.1.0","runs":[]}';
export const JAVAC_EXPORTS = ['api', 'file', 'parser', 'tree', 'util', 'code'].map(
  (name) => `--add-exports=jdk.compiler/com.sun.tools.javac.${name}=ALL-UNNAMED`,
);

function writeAuxClasspath({
  module,
  reportDir,
  classpaths,
}: Pick<PmdOptions, 'module' | 'reportDir' | 'classpaths'>): string {
  const file = path.join(reportDir, 'pmd-aux-classpath.txt');
  const entries = new Set([
    ...classpaths.mainCompile,
    ...classpaths.testCompile,
    module.outputDirectory,
    module.testOutputDirectory,
  ]);
  writeFileSync(file, [...entries].filter((entry) => existsSync(entry)).join('\n'));
  return file;
}

function pmdRulesets(
  context: Pick<
    PmdOptions,
    'module' | 'reportDir' | 'configs' | 'spring' | 'springRules' | 'reactor'
  >,
): string {
  const { module, reportDir } = context;
  const written = callUntyped(writeRulesets, context);
  const layers = fieldOf(written, 'layers');
  const project = fieldOf(layers, 'project');
  return [
    fieldOf(layers, 'nitpicker') ?? NITPICKER_RULESET,
    ...(project === undefined ? [] : [project]),
    fieldOf(written, 'testsRuleset'),
    fieldOf(written, 'mainRuleset'),
    ...writeGuardRulesets({
      reportDir,
      testDirectories: module.testSourceRoots,
      compiler: guardCompiler(compilerOf(module.compiler)),
    }),
  ].join(',');
}

export function runPmd(options: PmdOptions): void {
  const {
    module,
    reportDir,
    tools,
    classpaths,
    configs,
    spring,
    springRules,
    reactor,
    spawn,
    timeoutMs,
  } = options;
  const report = path.join(reportDir, 'pmd.sarif');
  const linted = [...module.sourceRoots, ...module.testSourceRoots].filter((root) =>
    existsSync(root),
  );
  if (javaFiles(linted).length === 0) {
    writeFileSync(report, EMPTY_SARIF);
    return;
  }
  const auxClasspath = writeAuxClasspath({ module, reportDir, classpaths });
  const rulesets = pmdRulesets({ module, reportDir, configs, spring, springRules, reactor });
  runJava({
    tool: 'PMD',
    classpath: tools['pmd'],
    mainClass: 'net.sourceforge.pmd.cli.PmdCli',
    args: [
      'check',
      '--no-cache',
      '--no-progress',
      '--format',
      'sarif',
      '--report-file',
      report,
      '--rulesets',
      rulesets,
      '--aux-classpath',
      `file:${auxClasspath}`,
      '--suppress-marker',
      'NITPICKER-NO-INLINE-SUPPRESSION',
      '--dir',
      linted.join(','),
    ],
    cwd: module.basedir,
    accept: () => existsSync(report),
    spawn,
    timeoutMs,
  });
}

export function runSpotbugs({
  module,
  reportDir,
  tools,
  configs,
  auxClasspath = [],
  spawn,
  timeoutMs,
}: SpotbugsOptions): void {
  const report = path.join(reportDir, 'spotbugs.sarif');
  const hasClasses =
    existsSync(module.outputDirectory) && readdirSync(module.outputDirectory).length > 0;
  if (!hasClasses) {
    writeFileSync(report, EMPTY_SARIF);
    return;
  }
  runJava({
    tool: 'SpotBugs',
    classpath: tools['spotbugs'],
    mainClass: 'edu.umd.cs.findbugs.FindBugs2',
    args: [
      ...textsOf(
        fieldOf(fieldOf(configs, 'spotbugs'), 'arguments') ?? spotbugsArguments(NITPICKER_SPOTBUGS),
      ),
      '-sarif',
      '-output',
      report,
      '-sourcepath',
      module.sourceRoots.filter((root) => existsSync(root)).join(path.delimiter),
      ...(auxClasspath.length === 0
        ? []
        : [
            '-auxclasspath',
            auxClasspath.filter((entry) => existsSync(entry)).join(path.delimiter),
          ]),
      module.outputDirectory,
    ],
    cwd: module.basedir,
    accept: () => existsSync(report),
    spawn,
    timeoutMs,
  });
}
