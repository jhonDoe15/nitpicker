import type { JavaEnvironment, JavaSpawn } from '../../adapters/typed/java-values.mts';
import { fieldOf, fieldsOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

export type ToolClasspathLists = Record<string, string[]>;
export type ToolDependencies = Record<string, string[]>;
export type ToolEntry = { readonly name: string; readonly coordinates: string[] };
export type ToolSetRequest = {
  readonly projectRoot: string;
  readonly maven?: string | undefined;
  readonly tools: Readonly<Record<string, readonly string[]>>;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: number | undefined;
  readonly environment?: JavaEnvironment | undefined;
};

export type MavenModule = Readonly<Record<string, unknown>> & {
  readonly coordinates: string;
  readonly packaging: string;
  readonly basedir: string;
  readonly buildDirectory: string;
};
export type MavenScope = {
  readonly reported: MavenModule[];
  readonly notAffected: string[];
  readonly selection: string[];
};
export type Dependency = {
  readonly groupId: string;
  readonly artifactId: string;
  readonly type: string;
  readonly scope: string;
  readonly file: string;
};
export type Classpaths = {
  readonly mainCompile: string[];
  readonly mainRuntime: string[];
  readonly testCompile: string[];
  readonly testRuntime: unknown[];
};

export function mavenModuleOf(value: unknown): MavenModule {
  return {
    ...fieldsOf(value),
    coordinates: textOf(fieldOf(value, 'coordinates')),
    packaging: textOf(fieldOf(value, 'packaging')),
    basedir: textOf(fieldOf(value, 'basedir')),
    buildDirectory: textOf(fieldOf(value, 'buildDirectory')),
  };
}

export function dependencyOf(value: unknown): Dependency {
  return {
    groupId: textOf(fieldOf(value, 'groupId')),
    artifactId: textOf(fieldOf(value, 'artifactId')),
    type: textOf(fieldOf(value, 'type')),
    scope: textOf(fieldOf(value, 'scope')),
    file: textOf(fieldOf(value, 'file')),
  };
}

export function classpathsOf(value: unknown): Classpaths {
  return {
    mainCompile: textsOf(fieldOf(value, 'mainCompile')),
    mainRuntime: textsOf(fieldOf(value, 'mainRuntime')),
    testCompile: textsOf(fieldOf(value, 'testCompile')),
    testRuntime: [...listOf(fieldOf(value, 'testRuntime'))],
  };
}

export function scopeOf(value: unknown): MavenScope {
  return {
    reported: listOf(fieldOf(value, 'reported')).map(mavenModuleOf),
    notAffected: textsOf(fieldOf(value, 'notAffected')),
    selection: textsOf(fieldOf(value, 'selection')),
  };
}
