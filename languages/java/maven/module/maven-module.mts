import path from 'node:path';
import { runFormat } from '../format/maven-format.mts';
import { runCheckstyle, runPmd, runSpotbugs } from '../maven-lint.mjs';
import { archunitMatcher } from '../maven-tests.mjs';
import { runSpringArch } from '../spring/maven-spring-arch.mts';
import { withDeclaredSpring, withFeatureFolders } from '../spring/arch-rules-gate.mts';
import { moduleManifest, usesReactor, writeManifest } from '../manifest/maven-manifest.mts';
import { ownSourceRoots } from '../../adapters/red-base/tests-failed.mts';
import { runErrorProne } from '../errorprone/maven-errorprone.mts';
import { parserJava, sourceLevel } from '../errorprone/maven-jdk.mjs';
import { analyzeKotlinModule } from '../kotlin/kotlin-module.mjs';
import { runGuards } from '../guards/maven-guards.mts';
import { runToolsConcurrently } from '../parallel/concurrent-tools.mts';
import { runJdeps, runStructure } from '../parallel/module-metrics.mts';
import { readTestRuns, runCoverageTools } from '../quick/maven-test-phase.mts';
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

function runArchitecture(options: ModuleOptions): void {
  const { module, reportDir, tools, classpaths, pinned, springArch, springRoles } = options;
  callUntyped(runSpringArch, {
    module,
    reportDir,
    tools,
    classpaths,
    pinned,
    archRules: springArch,
    springRoles,
    spawn: options['spawn'],
    timeoutMs: options['timeoutMs'],
  });
}

function sourceTask(
  tool: { readonly name: string },
  url: string,
  options: ModuleOptions,
): SourceTask {
  return { run: tool, url, name: tool.name, options };
}

function runSourceTools(options: ModuleOptions): void {
  const { module, reportDir, tools, classpaths, configs, pinned, kotlin, style } = options;
  const base = { module, reportDir, tools, configs, timeoutMs: options['timeoutMs'] };
  const tasks = [
    sourceTask(runPmd, LINT_URL, {
      ...base,
      classpaths,
      spring: fieldOf(kotlin, 'spring'),
      springRules: options['springRules'],
      reactor: options['reactor'],
    }),
    sourceTask(runSpotbugs, LINT_URL, {
      ...base,
      module: fieldOf(kotlin, 'spotbugsModule'),
      auxClasspath: fieldOf(kotlin, 'auxClasspath'),
    }),
    sourceTask(runErrorProne, ERRORPRONE_URL, { ...base, classpaths }),
    sourceTask(runFormat, FORMAT_URL, { ...base, javaStyle: fieldOf(style, 'javaStyle') }),
    sourceTask(runCheckstyle, LINT_URL, { ...base, pinned, style }),
    sourceTask(runStructure, METRICS_URL, base),
    sourceTask(runJdeps, METRICS_URL, base),
  ];
  callUntyped(runToolsConcurrently, tasks, {
    spawn: options['spawn'],
    concurrent: options['quick'] === true,
  });
}

function analyzeSources(options: ModuleOptions): unknown {
  const kotlin = callUntyped(analyzeKotlinModule, {
    ...options,
    options: options['kotlinOptions'],
  });
  runSourceTools({ ...options, kotlin: { ...fieldsOf(kotlin), spring: options['spring'] } });
  callUntyped(runGuards, options, options['project']);
  runArchitecture({ ...options, module: fieldOf(kotlin, 'coverageModule') });
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
  const kotlin = analyzeSources({
    ...options,
    reportDir,
    spring: fieldOf(manifest, 'spring'),
    springArch: fieldOf(manifest, 'springArch'),
    reactor: usesReactor(classpaths),
  });
  const testsSkipped = options['testsSkipped'] === true;
  if (failure === undefined && !testsSkipped) {
    callUntyped(runCoverageTools, {
      ...options,
      module: fieldOf(kotlin, 'coverageModule'),
      reportDir,
      testsRan: fieldOf(runs, 'testsRan'),
      isArchunit,
    });
  }
  const sourceJava = callUntyped(parserJava, {
    level: callUntyped(sourceLevel, module['compiler']),
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
