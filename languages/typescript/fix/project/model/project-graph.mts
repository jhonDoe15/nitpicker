import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import type { Project } from '../typed/project-types.mts';
import { moduleReferences } from './module-references.mts';
import type { ModuleReference } from './reference-types.mts';

const ts = typescriptApi();

type GraphModule = {
  readonly source: string;
  readonly dependencies: {
    readonly resolved: string;
    readonly module: string;
    readonly dependencyTypes: string[];
  }[];
};

function dependencyTypes(reference: ModuleReference): string[] {
  const types = reference.kind === 'export' ? ['local', 'export'] : ['local', 'import'];
  const typeOnly =
    (ts.isExportDeclaration(reference.node) && reference.node.isTypeOnly) ||
    (ts.isImportDeclaration(reference.node) &&
      fieldOf(reference.node.importClause, 'isTypeOnly') === true) ||
    reference.kind === 'type-import';
  return typeOnly ? [...types, 'type-only'] : types;
}

export function projectGraph(project: Project): { modules: GraphModule[] } {
  return {
    modules: project.names
      .filter((name) => project.sourceFile(name) !== undefined)
      .map((name) => ({
        source: name,
        dependencies: moduleReferences(project.sourceFile(name)).flatMap((reference) => {
          const { specifier } = reference;
          const resolved = specifier === undefined ? undefined : project.resolve(specifier, name);
          return specifier === undefined || resolved === undefined
            ? []
            : [
                {
                  resolved,
                  module: specifier,
                  dependencyTypes: dependencyTypes(reference),
                },
              ];
        }),
      })),
  };
}
