import { createHash } from 'node:crypto';
import { fieldsOf, messageOf } from '../../../../shared/values/readers.mts';
import type { JavaEnvironment, JavaSpawn } from '../../adapters/typed/java-values.mts';
import { type CompilerSettings, compilerOf } from '../errorprone/compiler-types.mts';
import { dependency, resolveToolSet } from '../maven-tools.mts';
import type { MavenModule, ToolClasspathLists, ToolEntry } from '../typed/maven-values.mts';
import { effectiveRepositoriesXml } from './pom-repositories.mts';

export type ProcessorResolution = {
  readonly classpaths: ToolClasspathLists;
  readonly failures: Readonly<Record<string, string>>;
};

export type ProcessorToolsRequest = {
  readonly projectRoot: string;
  readonly maven?: string | undefined;
  readonly modules: readonly MavenModule[];
  readonly effectivePom: unknown;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: number | undefined;
  readonly environment?: JavaEnvironment | undefined;
};

type MutableResolution = {
  readonly classpaths: ToolClasspathLists;
  readonly failures: Record<string, string>;
};

export function processorTool(compiler: Pick<CompilerSettings, 'processorPaths'>):
  | {
      readonly name: string;
      readonly coordinates: string[];
    }
  | undefined {
  if (compiler.processorPaths === undefined || compiler.processorPaths.length === 0) {
    return undefined;
  }
  const key = createHash('sha256').update(compiler.processorPaths.join('\n')).digest('hex');
  return { name: `processors-${key.slice(0, 16)}`, coordinates: compiler.processorPaths };
}

export function processorFailureFor(
  compiler: Pick<CompilerSettings, 'processorPaths' | 'proc'>,
  failures: Readonly<Record<string, string>> | undefined,
): string | undefined {
  if (compiler.proc === 'none' || failures === undefined) {
    return undefined;
  }
  const configured = processorTool(compiler);
  const reason = configured === undefined ? undefined : failures[configured.name];
  if (configured === undefined || reason === undefined) {
    return undefined;
  }
  return `Could not resolve annotation processors (${configured.coordinates.join(', ')}): ${reason}`;
}

function uniqueProcessorTools(modules: readonly MavenModule[]): ToolEntry[] {
  const seen = new Map<string, ToolEntry>();
  for (const module of modules) {
    const compiler = compilerOf(module['compiler']);
    const tool = compiler.proc === 'none' ? undefined : processorTool(compiler);
    if (tool !== undefined && !seen.has(tool.name)) {
      seen.set(tool.name, tool);
    }
  }
  return [...seen.values()];
}

function resolveSingleProcessor(
  entry: ToolEntry,
  request: ProcessorToolsRequest & { readonly repositoriesXml: string },
  result: MutableResolution,
): void {
  const tools = { [entry.name]: entry.coordinates.map((coordinate) => dependency(coordinate)) };
  try {
    const resolved = resolveToolSet({
      projectRoot: request.projectRoot,
      maven: request.maven,
      tools,
      repositoriesXml: request.repositoriesXml,
      spawn: request.spawn,
      timeoutMs: request.timeoutMs,
      environment: request.environment,
    });
    Object.assign(result.classpaths, resolved);
  } catch (error) {
    result.failures[entry.name] = messageOf(error);
  }
}

export function resolveProcessorTools(request: ProcessorToolsRequest): ProcessorResolution {
  const entries = uniqueProcessorTools(request.modules);
  if (entries.length === 0) {
    return { classpaths: {}, failures: {} };
  }
  const repositoriesXml = effectiveRepositoriesXml(
    typeof request.effectivePom === 'string' ? request.effectivePom : '',
  );
  const result: MutableResolution = { classpaths: {}, failures: {} };
  for (const entry of entries) {
    resolveSingleProcessor(entry, { ...request, repositoriesXml }, result);
  }
  return result;
}

export function withProcessorTools(
  baseTools: unknown,
  request: ProcessorToolsRequest,
): {
  readonly tools: Readonly<Record<string, unknown>>;
  readonly processorFailures: Readonly<Record<string, string>>;
} {
  const processors = resolveProcessorTools(request);
  return {
    tools: { ...fieldsOf(baseTools), ...processors.classpaths },
    processorFailures: processors.failures,
  };
}
