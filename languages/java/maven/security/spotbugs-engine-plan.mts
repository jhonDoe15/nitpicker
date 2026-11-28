import { existsSync } from 'node:fs';
import path from 'node:path';
import { filesEndingWith } from '../../../../shared/filesystem.mts';
import { type CompilerSettings, compilerOf } from '../compile-sets/compiler-types.mts';
import {
  type SpotbugsEnginePlan,
  spotbugsOnEngine,
  withoutSpotbugsEngineReport,
} from '../../builds/spotbugs/spotbugs-engine.mts';
import { declaredProcessorKind } from '../../builds/spotbugs/spotbugs-lombok.mts';
import { declaredLombokVersion } from '../../builds/spotbugs/spotbugs-lombok-version.mts';
import { jdkHome } from '../programs/jdk-home.mts';
import {
  type GeneratedLocation,
  PROCESSOR_OUTPUT,
  buildDirectoryOf,
  generatedRoots,
} from '../generated/generated-roots.mts';

export type SpotbugsEngineInput = {
  readonly compileClasspath: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
};

type EngineModule = GeneratedLocation & {
  readonly sourceRoots: readonly string[];
  readonly outputDirectory: string;
  readonly compiler: unknown;
};
type PlanOptions = {
  readonly module: EngineModule;
  readonly reportDir: string;
  readonly compiler: CompilerSettings;
  readonly compileClasspath: readonly string[];
  readonly auxiliary: readonly string[];
  readonly javaHome: string;
};

const UNCOMPILED = new Set(['package-info.java', 'module-info.java']);

function compiledFrom(root: string, file: string, classes: string): boolean {
  const relative = path.relative(root, file);
  if (UNCOMPILED.has(path.basename(relative))) {
    return true;
  }
  const base = path.resolve(classes);
  const classFile = path.resolve(base, relative.replace(/\.java$/u, '.class'));
  if (!classFile.startsWith(`${base}${path.sep}`)) {
    return false;
  }
  return existsSync(classFile);
}

const PROCESSOR_OPTIONS = new Set([
  '-processor',
  '-processorpath',
  '--processor-path',
  '--processor-module-path',
]);

function processorsOf(
  compiler: CompilerSettings,
  compileClasspath: readonly string[],
): Pick<SpotbugsEnginePlan, 'processorPath' | 'processors' | 'lombokVersion'> {
  if (compiler.proc === 'none') {
    return { processorPath: [], processors: 'none' };
  }
  if (compiler.processorPaths !== undefined && compiler.processorPaths.length > 0) {
    const lombokVersion = declaredLombokVersion(compiler.processorPaths);
    return {
      processorPath: [],
      processors: declaredProcessorKind(compiler.processorPaths),
      ...(lombokVersion === undefined ? {} : { lombokVersion }),
    };
  }
  return { processorPath: [...compileClasspath] };
}

export function spotbugsEnginePlan({
  module,
  reportDir,
  compiler,
  compileClasspath,
  auxiliary,
  javaHome,
}: PlanOptions): SpotbugsEnginePlan | undefined {
  const roots = module.sourceRoots.filter((root) => existsSync(root));
  const sources = roots.flatMap((root) =>
    filesEndingWith([root], '.java').map((file) => ({ root, file })),
  );
  const generated = [
    ...generatedRoots(module, module.sourceRoots),
    path.join(buildDirectoryOf(module), PROCESSOR_OUTPUT),
  ].filter((root) => existsSync(root));
  if (generated.some((root) => filesEndingWith([root], '.java').length > 0)) {
    return undefined;
  }
  const compiled = sources.every(({ root, file }) =>
    compiledFrom(root, file, module.outputDirectory),
  );
  const declaredProcessors =
    compiler.proc !== 'none' &&
    compiler.compilerArgs.some((argument) => PROCESSOR_OPTIONS.has(argument));
  if (!compiled || declaredProcessors) {
    return undefined;
  }
  return {
    reportDir,
    sources: sources.map(({ file }) => file).sort(),
    classpath: auxiliary,
    classes: [module.outputDirectory],
    ...processorsOf(compiler, compileClasspath),
    javaHome,
  };
}

export function spotbugsEngineArguments(
  {
    module,
    reportDir,
    auxiliary,
  }: {
    readonly module: EngineModule;
    readonly reportDir: string;
    readonly auxiliary: readonly string[];
  },
  engine: SpotbugsEngineInput | undefined,
): string[] {
  withoutSpotbugsEngineReport(reportDir);
  if (engine === undefined) {
    return [];
  }
  const plan = spotbugsEnginePlan({
    module,
    reportDir,
    compiler: compilerOf(module.compiler),
    compileClasspath: engine.compileClasspath,
    auxiliary,
    javaHome: jdkHome(engine.environment),
  });
  return plan === undefined ? [] : spotbugsOnEngine(plan, engine.environment);
}
