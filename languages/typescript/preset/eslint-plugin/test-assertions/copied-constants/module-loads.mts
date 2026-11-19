import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { literalText } from '../../rules/analysis/node/call-text.mts';

export type ModuleLoad = {
  readonly specifier: string;
  readonly names: Map<string, string[]>;
  readonly whole: boolean;
};

const ACTUAL_LOADS = new Set(['requireActual', 'importActual']);

function isLoadCall(callee: TSESTree.Node): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'require';
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    ACTUAL_LOADS.has(callee.property.name)
  );
}

function keyName(key: TSESTree.Node): string {
  return key.type === AST_NODE_TYPES.Identifier ? key.name : String(Reflect.get(key, 'value'));
}

function boundNames(
  load: TSESTree.CallExpression | TSESTree.ImportExpression,
): Map<string, string[]> {
  const holder = load.parent.type === AST_NODE_TYPES.AwaitExpression ? load.parent : load;
  const { parent } = holder;
  if (parent.type !== AST_NODE_TYPES.VariableDeclarator || parent.init !== holder) {
    return new Map();
  }
  if (parent.id.type !== AST_NODE_TYPES.ObjectPattern) {
    return new Map();
  }
  const names = new Map<string, string[]>();
  for (const property of parent.id.properties) {
    const local = property.type === AST_NODE_TYPES.Property ? property.value : undefined;
    const bound = local?.type === AST_NODE_TYPES.AssignmentPattern ? local.left : local;
    if (
      bound?.type === AST_NODE_TYPES.Identifier &&
      property.type === AST_NODE_TYPES.Property &&
      !property.computed
    ) {
      const name = keyName(property.key);
      names.set(name, [...(names.get(name) ?? []), bound.name]);
    }
  }
  return names;
}

function boundLoad(specifier: string, names: Map<string, string[]>): ModuleLoad {
  return { specifier, names, whole: names.size === 0 };
}

export function loadedModule(
  node: TSESTree.CallExpression | TSESTree.ImportExpression | TSESTree.TSImportEqualsDeclaration,
): ModuleLoad | undefined {
  if (node.type === AST_NODE_TYPES.ImportExpression) {
    const specifier = literalText(node.source);
    return specifier === undefined ? undefined : boundLoad(specifier, boundNames(node));
  }
  if (node.type === AST_NODE_TYPES.TSImportEqualsDeclaration) {
    const reference = node.moduleReference;
    const specifier =
      reference.type === AST_NODE_TYPES.TSExternalModuleReference && node.importKind !== 'type'
        ? literalText(reference.expression)
        : undefined;
    return specifier === undefined ? undefined : { specifier, names: new Map(), whole: true };
  }
  const specifier = isLoadCall(node.callee) ? literalText(node.arguments[0]) : undefined;
  return specifier === undefined ? undefined : boundLoad(specifier, boundNames(node));
}

export function importedModule(statement: TSESTree.ImportDeclaration): ModuleLoad {
  const names = new Map<string, string[]>();
  let whole = statement.specifiers.length === 0;
  for (const specifier of statement.specifiers) {
    if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
      whole = true;
    } else if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
      names.set('default', [specifier.local.name]);
    } else if (specifier.importKind !== 'type') {
      const imported =
        specifier.imported.type === AST_NODE_TYPES.Identifier
          ? specifier.imported.name
          : specifier.imported.value;
      names.set(imported, [...(names.get(imported) ?? []), specifier.local.name]);
    }
  }
  return { specifier: statement.source.value, names, whole };
}
