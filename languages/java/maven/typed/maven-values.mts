import { fieldOf, fieldsOf, textOf } from '../../../../shared/values/readers.mts';

export type MavenModule = Readonly<Record<string, unknown>> & {
  readonly coordinates: string;
  readonly packaging: string;
  readonly basedir: string;
  readonly buildDirectory: string;
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
