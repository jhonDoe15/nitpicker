import { moduleReferences } from './module-references.mjs';

function dependencyTypes(reference) {
  const types = reference.kind === 'export' ? ['local', 'export'] : ['local', 'import'];
  const typeOnly =
    reference.node.isTypeOnly === true ||
    reference.node.importClause?.isTypeOnly === true ||
    reference.kind === 'type-import';
  return typeOnly ? [...types, 'type-only'] : types;
}

export function projectGraph(project) {
  return {
    modules: project.names
      .filter((name) => project.sourceFile(name) !== undefined)
      .map((name) => ({
        source: name,
        dependencies: moduleReferences(project.sourceFile(name))
          .filter(({ specifier }) => specifier !== undefined)
          .flatMap((reference) => {
            const resolved = project.resolve(reference.specifier, name);
            return resolved === undefined
              ? []
              : [
                  {
                    resolved,
                    module: reference.specifier,
                    dependencyTypes: dependencyTypes(reference),
                  },
                ];
          }),
      })),
  };
}
