import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { type CompilerSettings, compilerOf } from '../errorprone/compiler-types.mts';
import {
  type SpotbugsEnginePlan,
  spotbugsOnEngine,
  withoutSpotbugsEngineReport,
} from '../../builds/spotbugs/spotbugs-engine.mts';
import { jdkHome } from '../programs/jdk-home.mts';

export type SpotbugsEngineInput = {
  readonly compileClasspath: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
};

type EngineModule = {
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

function javaSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return javaSources(full);
    }
    return entry.isFile() && entry.name.endsWith('.java') ? [full] : [];
  });
}

function compiledFrom(root: string, file: string, classes: string): boolean {
  const relative = path.relative(root, file);
  return (
    UNCOMPILED.has(path.basename(relative)) ||
    existsSync(path.join(classes, relative.replace(/\.java$/u, '.class')))
  );
}

const PROCESSOR_OPTIONS = new Set([
  '-processor',
  '-processorpath',
  '--processor-path',
  '--processor-module-path',
]);

function processorPath(compiler: CompilerSettings, compileClasspath: readonly string[]): string[] {
  return compiler.proc === 'none' ? [] : [...compileClasspath];
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
  const sources = roots.flatMap((root) => javaSources(root).map((file) => ({ root, file })));
  const compiled = sources.every(({ root, file }) =>
    compiledFrom(root, file, module.outputDirectory),
  );
  const declaredProcessors =
    compiler.proc !== 'none' &&
    ((compiler.processorPaths?.length ?? 0) > 0 ||
      compiler.compilerArgs.some((argument) => PROCESSOR_OPTIONS.has(argument)));
  if (!compiled || declaredProcessors) {
    return undefined;
  }
  return {
    reportDir,
    sources: sources.map(({ file }) => file).sort(),
    classpath: auxiliary,
    processorPath: processorPath(compiler, compileClasspath),
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
  return plan === undefined
    ? []
    : spotbugsOnEngine(plan, engine.environment, { log: process.stderr });
}
