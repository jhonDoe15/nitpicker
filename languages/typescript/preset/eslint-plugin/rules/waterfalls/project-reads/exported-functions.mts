import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunction } from '../../typed/syntax-views.mts';

export type FunctionLookup = {
  readonly file: string;
  readonly specifier: string;
  readonly name: string;
};
type Found =
  | { readonly kind: 'function'; readonly fn: TSESTree.FunctionLike }
  | { readonly kind: 'forwarded'; readonly lookup: FunctionLookup };

const DEFAULT = 'default';

function nameText(node: TSESTree.Identifier | TSESTree.StringLiteral): string {
  return node.type === AST_NODE_TYPES.Identifier ? node.name : node.value;
}

function declaredFunction(
  declaration: TSESTree.Node | undefined,
  name: string,
): TSESTree.FunctionLike | undefined {
  if (declaration?.type === AST_NODE_TYPES.FunctionDeclaration) {
    return declaration.id?.name === name ? declaration : undefined;
  }
  if (declaration?.type !== AST_NODE_TYPES.VariableDeclaration || declaration.kind !== 'const') {
    return undefined;
  }
  const init = declaration.declarations.find(
    (declarator) => declarator.id.type === AST_NODE_TYPES.Identifier && declarator.id.name === name,
  )?.init;
  return init && isFunction(init) ? init : undefined;
}

function localFunction(program: TSESTree.Program, file: string, name: string): Found | undefined {
  for (const statement of program.body) {
    const declaration =
      statement.type === AST_NODE_TYPES.ExportNamedDeclaration
        ? (statement.declaration ?? undefined)
        : statement;
    const fn = declaredFunction(declaration, name);
    if (fn !== undefined) {
      return { kind: 'function', fn };
    }
    const imported =
      statement.type === AST_NODE_TYPES.ImportDeclaration && statement.importKind !== 'type'
        ? statement.specifiers.find(
            (specifier) =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.local.name === name,
          )
        : undefined;
    if (
      imported?.type === AST_NODE_TYPES.ImportSpecifier &&
      statement.type === AST_NODE_TYPES.ImportDeclaration
    ) {
      const original = nameText(imported.imported);
      return {
        kind: 'forwarded',
        lookup: { file, specifier: statement.source.value, name: original },
      };
    }
  }
  return undefined;
}

function defaultExport(program: TSESTree.Program, file: string): Found | undefined {
  const statement = program.body.find(
    (each): each is TSESTree.ExportDefaultDeclaration =>
      each.type === AST_NODE_TYPES.ExportDefaultDeclaration,
  );
  const declaration = statement?.declaration;
  if (declaration === undefined) {
    return undefined;
  }
  if (isFunction(declaration)) {
    return { kind: 'function', fn: declaration };
  }
  return declaration.type === AST_NODE_TYPES.Identifier
    ? localFunction(program, file, declaration.name)
    : undefined;
}

function listedExport(
  statement: TSESTree.ExportNamedDeclaration,
  program: TSESTree.Program,
  file: string,
  name: string,
): Found | undefined {
  const specifier = statement.specifiers.find(
    (each) => nameText(each.exported) === name && statement.exportKind !== 'type',
  );
  if (specifier === undefined) {
    return undefined;
  }
  const local = nameText(specifier.local);
  return statement.source === null
    ? localFunction(program, file, local)
    : { kind: 'forwarded', lookup: { file, specifier: statement.source.value, name: local } };
}

export function exportedFunction(
  program: TSESTree.Program,
  file: string,
  name: string,
): Found | undefined {
  if (name === DEFAULT) {
    return defaultExport(program, file);
  }
  for (const statement of program.body) {
    if (statement.type !== AST_NODE_TYPES.ExportNamedDeclaration) {
      continue;
    }
    const fn = declaredFunction(statement.declaration ?? undefined, name);
    const found = fn === undefined ? listedExport(statement, program, file, name) : undefined;
    if (fn !== undefined) {
      return { kind: 'function', fn };
    }
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}
