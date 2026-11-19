import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { resolveModuleSpecifier } from './class-views.mts';
import type { ClassMeasure } from './class-measures.mts';

const ts = typescriptApi();

type Binding = { readonly specifier: string; readonly imported: string };
type Export =
  | { readonly kind: 'local'; readonly name: string }
  | { readonly kind: 'from'; readonly specifier: string; readonly name: string };

export type FileFacts = {
  readonly classes: ReadonlyMap<string, ClassMeasure>;
  readonly imports: ReadonlyMap<string, Binding>;
  readonly exports: ReadonlyMap<string, Export>;
  readonly stars: readonly string[];
};

function exportedByModifier(statement: TypeScript.Statement): [string, string][] {
  const modifiers = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : [];
  if (!modifiers.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword)) {
    return [];
  }
  const isDefault = modifiers.some(({ kind }) => kind === ts.SyntaxKind.DefaultKeyword);
  if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
    return [[isDefault ? DEFAULT : statement.name.text, statement.name.text]];
  }
  if (!ts.isVariableStatement(statement)) {
    return [];
  }
  return statement.declarationList.declarations.flatMap((declaration) =>
    ts.isIdentifier(declaration.name) ? [[declaration.name.text, declaration.name.text]] : [],
  );
}

const DEFAULT = 'default';

function namespaceBinding(name: string, specifier: string): [string, Binding] {
  return [name, { specifier, imported: '*' }];
}

function importBindings(statement: TypeScript.ImportDeclaration): [string, Binding][] {
  const clause = statement.importClause;
  if (clause === undefined || !ts.isStringLiteral(statement.moduleSpecifier)) {
    return [];
  }
  const specifier = statement.moduleSpecifier.text;
  const bindings = clause.namedBindings;
  const named =
    bindings !== undefined && ts.isNamedImports(bindings)
      ? bindings.elements.map((element): [string, Binding] => [
          element.name.text,
          { specifier, imported: (element.propertyName ?? element.name).text },
        ])
      : [];
  const namespace =
    bindings !== undefined && ts.isNamespaceImport(bindings)
      ? [namespaceBinding(bindings.name.text, specifier)]
      : [];
  const fallback: [string, Binding][] =
    clause.name === undefined ? [] : [[clause.name.text, { specifier, imported: DEFAULT }]];
  return [...named, ...namespace, ...fallback];
}

function exportEntries(statement: TypeScript.ExportDeclaration): [string, Export][] {
  const bindings = statement.exportClause;
  if (bindings === undefined || !ts.isNamedExports(bindings)) {
    return [];
  }
  const specifier =
    statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : undefined;
  return bindings.elements.map((element): [string, Export] => {
    const name = (element.propertyName ?? element.name).text;
    return [
      element.name.text,
      specifier === undefined ? { kind: 'local', name } : { kind: 'from', specifier, name },
    ];
  });
}

export function fileFacts(
  sourceFile: TypeScript.SourceFile,
  measures: readonly ClassMeasure[],
): FileFacts {
  const statements = [...sourceFile.statements];
  const exports = new Map<string, Export>();
  for (const statement of statements) {
    for (const [exported, name] of exportedByModifier(statement)) {
      exports.set(exported, { kind: 'local', name });
    }
    if (ts.isExportDeclaration(statement)) {
      for (const [name, entry] of exportEntries(statement)) {
        exports.set(name, entry);
      }
    }
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      exports.set(DEFAULT, { kind: 'local', name: statement.expression.text });
    }
  }
  return {
    classes: new Map(
      measures.flatMap((entry) => (entry.local === undefined ? [] : [[entry.local, entry]])),
    ),
    imports: new Map(
      statements.filter(ts.isImportDeclaration).flatMap((statement) => importBindings(statement)),
    ),
    exports,
    stars: statements.flatMap((statement) =>
      ts.isExportDeclaration(statement) &&
      statement.exportClause === undefined &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
        ? [statement.moduleSpecifier.text]
        : [],
    ),
  };
}

type Step = {
  readonly file: string;
  readonly name: string;
  readonly path: readonly string[];
  readonly exported: boolean;
};

function importedStep(binding: Binding, step: Step): Step | undefined {
  const target = resolveModuleSpecifier(binding.specifier, step.file).path;
  const exported = binding.imported === '*' ? step.path[0] : binding.imported;
  const rest = binding.imported === '*' ? step.path.slice(1) : step.path;
  if (target === undefined || exported === undefined || rest.length > 0) {
    return undefined;
  }
  return { file: target, name: exported, path: [], exported: true };
}

function nextSteps(step: Step, here: FileFacts): { found?: ClassMeasure; steps: Step[] } {
  if (!step.exported) {
    const local = step.path.length === 0 ? here.classes.get(step.name) : undefined;
    const binding = here.imports.get(step.name);
    const next =
      local === undefined && binding !== undefined ? importedStep(binding, step) : undefined;
    return local === undefined
      ? { steps: next === undefined ? [] : [next] }
      : { found: local, steps: [] };
  }
  const entry = here.exports.get(step.name);
  if (entry?.kind === 'local') {
    return { steps: [{ file: step.file, name: entry.name, path: [], exported: false }] };
  }
  const targets =
    entry?.kind === 'from'
      ? [{ specifier: entry.specifier, name: entry.name }]
      : here.stars.map((specifier) => ({ specifier, name: step.name }));
  return {
    steps: targets.flatMap(({ specifier, name }) => {
      const file = resolveModuleSpecifier(specifier, step.file).path;
      return file === undefined ? [] : [{ file, name, path: [], exported: true }];
    }),
  };
}

export function resolveBase(
  entry: ClassMeasure,
  facts: ReadonlyMap<string, FileFacts>,
): ClassMeasure | undefined {
  if (entry.base === undefined) {
    return undefined;
  }
  const [name = '', ...path] = entry.base.split('.');
  const pending: Step[] = [{ file: entry.source, name, path, exported: false }];
  const seen = new Set<string>();
  for (const step of pending) {
    const key = `${step.file}\0${step.name}\0${step.path.join('.')}\0${String(step.exported)}`;
    const here = facts.get(step.file);
    if (here === undefined || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const { found, steps } = nextSteps(step, here);
    if (found !== undefined) {
      return found;
    }
    for (const next of steps) {
      pending.push(next);
    }
  }
  return undefined;
}
