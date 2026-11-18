import path from 'node:path';
import { runFormat } from '../format/maven-format.mts';
import { runCheckstyle, runPmd, runSpotbugs } from '../maven-lint.mts';
import { archunitMatcher } from '../maven-tests.mts';
import { withDeclaredSpring, withFeatureFolders } from '../spring/arch-rules-gate.mts';
import { moduleManifest, usesReactor, writeManifest } from '../manifest/maven-manifest.mts';
import { ownSourceRoots } from '../../adapters/red-base/tests-failed.mts';
import { runErrorProne } from '../errorprone/maven-errorprone.mts';
import { parserJava, sourceLevel } from '../errorprone/maven-jdk.mts';
import { analyzeKotlinModule } from '../kotlin/kotlin-module.mts';
import { runToolsConcurrently } from '../parallel/concurrent-tools.mts';
import { runJdeps, runStructure } from '../parallel/module-metrics.mts';
import { runModuleChecks, runModuleCoverage } from '../parallel/module-tasks.mts';
import { readTestRuns } from '../quick/maven-test-phase.mts';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import { fieldOf, fieldsOf, textOf } from '../../../../shared/values/readers.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import type { Classpaths, MavenModule } from '../typed/maven-values.mts';

type ModuleOptions = Readonly<Record<string, unknown>>;
type ModuleRequest = ModuleOptions & {
  readonly module: MavenModule;
  readonly classpaths: Classpaths;
  readonly pinned: unknown;
};
type SourceTask = {
  readonly run: unknown;
  readonly url: string;
  readonly name: string;
  readonly options: ModuleOptions;
};

export const MAVEN_REPORT_DIRECTORY = 'target/nitpicker';
const LINT_URL = textOf(checkoutModuleUrl(new URL('../maven-lint.mjs', import.meta.url)).href);
const FORMAT_URL = textOf(
  checkoutModuleUrl(new URL('../format/maven-format.mjs', import.meta.url)).href,
);
const ERRORPRONE_URL = textOf(
  checkoutModuleUrl(new URL('../errorprone/maven-errorprone.mjs', import.meta.url)).href,
);
const METRICS_URL = textOf(
  checkoutModuleUrl(new URL('../parallel/module-metrics.mjs', import.meta.url)).href,
);
const TASKS_URL = textOf(
  checkoutModuleUrl(new URL('../parallel/module-tasks.mjs', import.meta.url)).href,
);

function sourceTask(
  tool: { readonly name: string },
  url: string,
  options: ModuleOptions,
): SourceTask {
  return { run: tool, url, name: tool.name, options };
}

function withoutFunctions(options: ModuleOptions): ModuleOptions {
  return Object.fromEntries(
    Object.entries(options).filter(
      ([name, value]) => name === 'spawn' || typeof value !== 'function',
    ),
  );
}

function coverageTasks(options: ModuleOptions, coverageModule: unknown): SourceTask[] {
  const coverage = options['coverage'];
  if (coverage === undefined) {
    return [];
  }
  const task = withoutFunctions({ ...options, ...fieldsOf(coverage), module: coverageModule });
  return [sourceTask(runModuleCoverage, TASKS_URL, task)];
}

function runSourceTools(options: ModuleOptions): void {
  const { module, reportDir, tools, classpaths, configs, pinned, kotlin, style } = options;
  const base = {
    module,
    reportDir,
    tools,
    configs,
    timeoutMs: options['timeoutMs'],
    environment: options['environment'],
  };
  const coverageModule = fieldOf(kotlin, 'coverageModule');
  const tasks = [
    ...coverageTasks(options, coverageModule),
    sourceTask(runErrorProne, ERRORPRONE_URL, { ...base, classpaths }),
    sourceTask(runPmd, LINT_URL, {
      ...base,
      classpaths,
      spring: fieldOf(kotlin, 'spring'),
      springRules: options['springRules'],
      reactor: options['reactor'],
    }),
    sourceTask(runCheckstyle, LINT_URL, { ...base, pinned, style }),
    sourceTask(runSpotbugs, LINT_URL, {
      ...base,
      module: fieldOf(kotlin, 'spotbugsModule'),
      auxClasspath: fieldOf(kotlin, 'auxClasspath'),
    }),
    sourceTask(runModuleChecks, TASKS_URL, withoutFunctions({ ...options, coverageModule })),
    sourceTask(runFormat, FORMAT_URL, {
      ...base,
      javaStyle: fieldOf(style, 'javaStyle'),
      formatterFlags: fieldOf(style, 'formatterFlags'),
    }),
    sourceTask(runStructure, METRICS_URL, base),
    sourceTask(runJdeps, METRICS_URL, base),
  ];
  callUntyped(runToolsConcurrently, tasks, { spawn: options['spawn'] });
}

function analyzeSources(options: ModuleOptions): unknown {
  const kotlin = callUntyped(analyzeKotlinModule, {
    ...options,
    options: options['kotlinOptions'],
  });
  runSourceTools({ ...options, kotlin: { ...fieldsOf(kotlin), spring: options['spring'] } });
  return kotlin;
}

function moduleManifestOf({ module, classpaths, pinned, ...options }: ModuleRequest): unknown {
  return callUntyped(
    withFeatureFolders,
    callUntyped(
      withDeclaredSpring,
      callUntyped(moduleManifest, { module, classpaths, pinned }),
      options['spring'],
    ),
    options['featureFolders'],
  );
}

export function analyzeModule(options: ModuleRequest): unknown {
  const { module, classpaths } = options;
  const reportDir = path.join(module.basedir, MAVEN_REPORT_DIRECTORY);
  const isArchunit = callUntyped(archunitMatcher, module['archunitIncludes']);
  const manifest = moduleManifestOf(options);
  const runs = callUntyped(readTestRuns, {
    ...options,
    reportDir,
    isArchunit,
    testRuntime: classpaths.testRuntime,
  });
  const failure = fieldOf(runs, 'failure');
  const testsSkipped = options['testsSkipped'] === true;
  const kotlin = analyzeSources({
    ...options,
    reportDir,
    spring: fieldOf(manifest, 'spring'),
    springArch: fieldOf(manifest, 'springArch'),
    reactor: usesReactor(classpaths),
    coverage:
      failure === undefined && !testsSkipped && options['quick'] !== true
        ? { testsRan: fieldOf(runs, 'testsRan'), archunitIncludes: module['archunitIncludes'] }
        : undefined,
  });
  const sourceJava = callUntyped(parserJava, {
    level: callUntyped(sourceLevel, module['compiler']),
    environment: options['environment'],
  });
  const written = { ...fieldsOf(manifest), ...fieldsOf(fieldOf(kotlin, 'manifest')), sourceJava };
  callUntyped(writeManifest, {
    reportDir,
    manifest: written,
    testsFailed: failure !== undefined || testsSkipped,
  });
  return failure === undefined
    ? undefined
    : { ...fieldsOf(failure), roots: ownSourceRoots(written) };
}
