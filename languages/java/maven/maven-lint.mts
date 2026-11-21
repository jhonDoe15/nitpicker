import { writeGuardRulesets } from '../builds/rulesets/pmd-rulesets.mts';
import { guardCompiler } from './errorprone/maven-compiler.mts';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from './programs/java-command.mts';
import { type SourceModule, compilerOf } from './errorprone/compiler-types.mts';
import { writeRulesets } from '../adapters/tool-config/pmd-wrappers.mts';
import { NITPICKER_RULESET } from '../adapters/tool-config/layer-files.mts';
import {
  NITPICKER_SPOTBUGS,
  spotbugsArguments,
} from '../adapters/tool-config/declared/spotbugs-declared.mts';
import { type JavaSpawn, callUntyped } from '../adapters/typed/java-values.mts';
import { fieldOf, textsOf } from '../../../shared/values/readers.mts';
import type { Classpaths } from './typed/maven-values.mts';
import type { ToolClasspaths } from './typed/kotlin-types.mts';
import { javaFiles } from './lint/java-files.mts';
import { PMD_LOG } from '../adapters/reporting/sarif/processing/pmd-rule-crashes.mts';
import { analyzesGenerated, handWrittenRoots } from './generated/generated-roots.mts';
import { handWrittenClasses } from './generated/spotbugs-targets.mts';
import { spotbugsLaunch } from './security/spotbugs-launch.mts';
import {
  pmdRulesetsWithEngine,
  withoutEngineReports,
} from '../builds/rulesets/engine/pmd-engine.mts';
import { jdkHome } from './programs/jdk-home.mts';
import { withoutSpotbugsEngineReport } from '../builds/spotbugs/spotbugs-engine.mts';
import {
  spotbugsEngineArguments,
  type SpotbugsEngineInput,
} from './security/spotbugs-engine-plan.mts';

export { javaFiles } from './lint/java-files.mts';
export { runCheckstyle, writeCheckstyleSetup } from './lint/maven-checkstyle.mts';

type Execution = {
  readonly reportDir: string;
  readonly tools: ToolClasspaths;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: number | undefined;
};
type PmdOptions = Execution & {
  readonly module: SourceModule & { readonly buildDirectory?: string };
  readonly classpaths: Pick<Classpaths, 'mainCompile' | 'testCompile'>;
  readonly configs: unknown;
  readonly spring: unknown;
  readonly springRules?: unknown;
  readonly reactor?: unknown;
  readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
};
type SpotbugsOptions = Execution & {
  readonly module: SourceModule & { readonly buildDirectory?: string };
  readonly configs: unknown;
  readonly auxClasspath?: readonly string[];
  readonly engine?: SpotbugsEngineInput | undefined;
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

const SUPPRESS_MARKER = 'NITPICKER-NO-INLINE-SUPPRESSION';
const PMD_JAVA_JAR = /(^|[\\/])pmd-java-[^\\/]*\.jar$/u;
const SPRING_DATA_JAR = /(^|[\\/])spring-data-(commons|jpa)-[^\\/]*\.jar$/u;

function pmdRulesets(
  context: Pick<
    PmdOptions,
    'module' | 'reportDir' | 'configs' | 'spring' | 'springRules' | 'reactor' | 'classpaths'
  >,
): { readonly rulesets: string[]; readonly untouched: string[] } {
  const { module, reportDir, classpaths, configs } = context;
  const springData =
    classpaths.mainCompile.length === 0 ||
    classpaths.mainCompile.some((entry) => SPRING_DATA_JAR.test(entry));
  const written = callUntyped(writeRulesets, { ...context, springData });
  const layers = fieldOf(written, 'layers');
  const untouched = textsOf([fieldOf(layers, 'project')].filter((file) => file !== undefined));
  return {
    untouched,
    rulesets: textsOf([
      fieldOf(layers, 'nitpicker') ?? NITPICKER_RULESET,
      ...untouched,
      fieldOf(written, 'testsRuleset'),
      fieldOf(written, 'mainRuleset'),
      ...writeGuardRulesets({
        reportDir,
        testDirectories: handWrittenRoots(module, module.testSourceRoots, configs),
        compiler: guardCompiler(compilerOf(module.compiler)),
      }),
    ]),
  };
}

function rulesetsToRun(options: PmdOptions, files: { aux: string; dirs: string[] }): string[] {
  const { reportDir, tools, environment } = options;
  const { rulesets, untouched } = pmdRulesets(options);
  if (environment === undefined) {
    return rulesets;
  }
  return pmdRulesetsWithEngine(
    {
      reportDir,
      rulesets,
      untouched,
      sources: files.dirs,
      auxClasspath: files.aux,
      pmdJar: (tools['pmd'] ?? []).find((entry) => PMD_JAVA_JAR.test(entry)) ?? '',
      javaHome: jdkHome(environment),
      suppressMarker: SUPPRESS_MARKER,
    },
    environment,
  );
}

function pmdArguments(files: { report: string; rulesets: string[]; aux: string; dirs: string[] }) {
  return [
    'check',
    '--no-cache',
    '--no-progress',
    '--format',
    'sarif',
    '--report-file',
    files.report,
    '--rulesets',
    files.rulesets.join(','),
    '--aux-classpath',
    `file:${files.aux}`,
    '--suppress-marker',
    SUPPRESS_MARKER,
    '--dir',
    files.dirs.join(','),
  ];
}

export function runPmd(options: PmdOptions): void {
  const { module, reportDir, tools, classpaths, configs, spawn, timeoutMs } = options;
  const report = path.join(reportDir, 'pmd.sarif');
  const linted = handWrittenRoots(
    module,
    [...module.sourceRoots, ...module.testSourceRoots],
    configs,
  ).filter((root) => existsSync(root));
  if (javaFiles(linted).length === 0) {
    withoutEngineReports(reportDir);
    writeFileSync(report, EMPTY_SARIF);
    return;
  }
  const aux = writeAuxClasspath({ module, reportDir, classpaths });
  const rulesets = rulesetsToRun(options, { aux, dirs: linted });
  const result = runJava({
    tool: 'PMD',
    classpath: tools['pmd'],
    mainClass: 'net.sourceforge.pmd.cli.PmdCli',
    args: pmdArguments({ report, rulesets, aux, dirs: linted }),
    cwd: module.basedir,
    accept: () => existsSync(report),
    spawn,
    timeoutMs,
  });
  const stderr = fieldOf(result, 'stderr');
  writeFileSync(path.join(reportDir, PMD_LOG), typeof stderr === 'string' ? stderr : '');
}

export function runSpotbugs({
  module,
  reportDir,
  tools,
  configs,
  auxClasspath = [],
  engine,
  spawn,
  timeoutMs,
}: SpotbugsOptions): void {
  const report = path.join(reportDir, 'spotbugs.sarif');
  withoutSpotbugsEngineReport(reportDir);
  const analyzed = path.resolve(module.outputDirectory);
  const auxiliary = auxClasspath.filter(
    (entry) => path.resolve(entry) !== analyzed && existsSync(entry),
  );
  const auxClasspathFile = path.join(reportDir, 'spotbugs-aux-classpath.txt');
  const hasClasses =
    existsSync(module.outputDirectory) && readdirSync(module.outputDirectory).length > 0;
  if (!hasClasses) {
    writeFileSync(report, EMPTY_SARIF);
    return;
  }
  const targets = analyzesGenerated(configs)
    ? undefined
    : handWrittenClasses({ module, reportDir, spawn, timeoutMs });
  if (targets?.empty === true) {
    writeFileSync(report, EMPTY_SARIF);
    return;
  }
  const aux = targets === undefined ? auxiliary : [...auxiliary, module.outputDirectory];
  writeFileSync(auxClasspathFile, [...new Set(aux)].join('\n'));
  const declared = fieldOf(fieldOf(configs, 'spotbugs'), 'arguments');
  const added =
    targets === undefined && declared === undefined
      ? spotbugsEngineArguments({ module, reportDir, auxiliary: [...new Set(aux)] }, engine)
      : [];
  runJava({
    tool: 'SpotBugs',
    classpath: tools['spotbugs'],
    mainClass: 'edu.umd.cs.findbugs.FindBugs2',
    ...spotbugsLaunch({
      module,
      report,
      tools,
      settings: [...textsOf(declared ?? spotbugsArguments(NITPICKER_SPOTBUGS)), ...added],
      auxClasspathFile: aux.length === 0 ? undefined : auxClasspathFile,
      ...(targets === undefined ? {} : { targets: ['-analyzeFromFile', targets.list] }),
    }),
    cwd: module.basedir,
    accept: () => existsSync(report),
    spawn,
    timeoutMs,
  });
}
