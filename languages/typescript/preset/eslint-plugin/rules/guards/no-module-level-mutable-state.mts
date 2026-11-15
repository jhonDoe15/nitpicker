import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../analysis/constant-resolution.mts';
import {
  compositionRootOptionsSchema,
  isCompositionRootFile,
  type CompositionRootOptions,
} from '../boundaries/composition-root-files.mts';
import { nameOf } from '../typed/node-views.mts';
import { ASSERTION_FORMS, unwrapOf } from '../typed/syntax-views.mts';

type Node = TSESTree.Node;
type ConstantDeclarator = TSESTree.VariableDeclarator & {
  readonly id: TSESTree.Identifier;
  readonly init: TSESTree.Expression;
};

const COLLECTION_CONSTRUCTORS = new Set<string>([
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
]);
const CONTAINER_CONSTRUCTORS = new Set<string>([...COLLECTION_CONSTRUCTORS, 'Array']);
const MUTATING_METHODS = new Set<string>([
  'set',
  'add',
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
  'clear',
  'delete',
]);

function isObjectCreate(expression: Node): boolean {
  return (
    expression.type === AST_NODE_TYPES.CallExpression &&
    expression.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(expression.callee.object) === 'Object' &&
    nameOf(expression.callee.property) === 'create'
  );
}

function isConstructed(expression: Node, constructors: ReadonlySet<string>): boolean {
  return (
    expression.type === AST_NODE_TYPES.NewExpression &&
    expression.callee.type === AST_NODE_TYPES.Identifier &&
    constructors.has(expression.callee.name)
  );
}

function isCollection(initializer: Node): boolean {
  const expression = unwrapOf(initializer, ASSERTION_FORMS);
  return isObjectCreate(expression) || isConstructed(expression, COLLECTION_CONSTRUCTORS);
}

function hasMutatingMethods(initializer: Node): boolean {
  const expression = unwrapOf(initializer, ASSERTION_FORMS);
  return (
    expression.type === AST_NODE_TYPES.ArrayExpression ||
    isConstructed(expression, CONTAINER_CONSTRUCTORS)
  );
}

function isContainer(initializer: Node): boolean {
  const expression = unwrapOf(initializer, ASSERTION_FORMS);
  if (
    expression.type === AST_NODE_TYPES.ArrayExpression ||
    expression.type === AST_NODE_TYPES.ObjectExpression
  ) {
    return true;
  }
  return isObjectCreate(expression) || isConstructed(expression, CONTAINER_CONSTRUCTORS);
}

function outermostMember(identifier: Node): Node {
  const chain = [identifier];
  for (const current of chain) {
    if (
      current.parent?.type === AST_NODE_TYPES.MemberExpression &&
      current.parent.object === current
    ) {
      chain.push(current.parent);
    }
  }
  return chain.at(-1) ?? identifier;
}

const MUTATING_STATICS = new Map<string, ReadonlySet<string>>([
  ['Object', new Set(['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'])],
  ['Reflect', new Set(['set', 'defineProperty', 'deleteProperty', 'setPrototypeOf'])],
]);

function isMutatingStaticTarget(identifier: Node): boolean {
  const { parent } = identifier;
  if (parent?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = parent;
  return (
    parent.arguments[0] === identifier &&
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    MUTATING_STATICS.get(nameOf(callee.object) ?? '')?.has(nameOf(callee.property) ?? '') === true
  );
}

function isMutatedBy(identifier: Node, ownMethodsMutate: boolean): boolean {
  const member = outermostMember(identifier);
  const { parent } = member;
  if (member === identifier) {
    return isMutatingStaticTarget(identifier);
  }
  const mutatingCall =
    parent?.type === AST_NODE_TYPES.CallExpression &&
    parent.callee === member &&
    member.type === AST_NODE_TYPES.MemberExpression &&
    MUTATING_METHODS.has(nameOf(member.property) ?? '') &&
    (ownMethodsMutate || member.object !== identifier);
  return (
    mutatingCall ||
    (parent?.type === AST_NODE_TYPES.AssignmentExpression && parent.left === member) ||
    parent?.type === AST_NODE_TYPES.UpdateExpression ||
    (parent?.type === AST_NODE_TYPES.UnaryExpression && parent.operator === 'delete')
  );
}

function isContainerDeclarator(
  declarator: TSESTree.VariableDeclarator,
): declarator is ConstantDeclarator {
  return (
    declarator.id.type === AST_NODE_TYPES.Identifier &&
    declarator.init !== null &&
    isContainer(declarator.init)
  );
}

function moduleLevelConstants(program: TSESTree.Program): ConstantDeclarator[] {
  return program.body
    .map((statement) =>
      statement.type === AST_NODE_TYPES.ExportNamedDeclaration ? statement.declaration : statement,
    )
    .flatMap((statement) =>
      statement?.type === AST_NODE_TYPES.VariableDeclaration && statement.kind === 'const'
        ? statement.declarations
        : [],
    )
    .filter(isContainerDeclarator);
}

const READONLY_TYPES = new Set<string>(['ReadonlyMap', 'ReadonlySet', 'ReadonlyArray']);

function isReadonlyAnnotation(declarator: ConstantDeclarator): boolean {
  const annotation = declarator.id.typeAnnotation?.typeAnnotation;
  if (annotation?.type === AST_NODE_TYPES.TSTypeOperator) {
    return annotation.operator === 'readonly';
  }
  return (
    annotation?.type === AST_NODE_TYPES.TSTypeReference &&
    annotation.typeName.type === AST_NODE_TYPES.Identifier &&
    READONLY_TYPES.has(annotation.typeName.name)
  );
}

function isExportedCollection(declarator: ConstantDeclarator): boolean {
  return (
    declarator.parent.parent.type === AST_NODE_TYPES.ExportNamedDeclaration &&
    isCollection(declarator.init) &&
    !isReadonlyAnnotation(declarator)
  );
}

function aliasDeclarator(identifier: Node): TSESTree.VariableDeclarator | undefined {
  const { parent } = identifier;
  return parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === identifier &&
    parent.id.type === AST_NODE_TYPES.Identifier &&
    parent.parent.kind === 'const'
    ? parent
    : undefined;
}

function referencesWithAliases(context: SourceContext, declarator: Node): Node[] {
  const variables = [...context.sourceCode.getDeclaredVariables(declarator)];
  const identifiers: Node[] = [];
  for (const variable of variables) {
    const reads = variable.references.map(({ identifier }) => identifier);
    identifiers.push(...reads);
    const aliases = reads.map(aliasDeclarator).filter((alias) => alias !== undefined);
    variables.push(...aliases.flatMap((alias) => context.sourceCode.getDeclaredVariables(alias)));
  }
  return identifiers;
}

function stateReport(
  context: SourceContext,
  declarator: ConstantDeclarator,
): 'exportedState' | 'moduleState' | undefined {
  if (isExportedCollection(declarator)) {
    return 'exportedState';
  }
  const ownMethodsMutate = hasMutatingMethods(declarator.init);
  return referencesWithAliases(context, declarator).some((identifier) =>
    isMutatedBy(identifier, ownMethodsMutate),
  )
    ? 'moduleState'
    : undefined;
}

export const rule: TSESLint.RuleModule<'moduleState' | 'exportedState', CompositionRootOptions> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow module-level collections and objects that the module mutates' },
    schema: compositionRootOptionsSchema,
    messages: {
      moduleState:
        "Module-level '{{name}}' is mutated, which is hidden shared state. Build a lookup table inside a function and return it, create shared state in the composition root and pass it in, or return a new value instead of mutating. An exception fits only when it is a deliberate per-process singleton.",
      exportedState:
        "Module-level '{{name}}' is an exported mutable collection that any importer can change. If importers only read it, annotate it with a readonly type (`ReadonlySet<T>`, `ReadonlyMap<K, V>`, `readonly number[]`); otherwise build it inside a function and return it, or create it in the composition root and pass it in. An exception fits only when it is a deliberate per-process singleton.",
    },
  },
  create(context) {
    if (isCompositionRootFile(context)) {
      return {};
    }
    return {
      'Program:exit'(program: TSESTree.Program) {
        for (const declarator of moduleLevelConstants(program)) {
          const messageId = stateReport(context, declarator);
          if (messageId !== undefined) {
            context.report({ node: declarator.id, messageId, data: { name: declarator.id.name } });
          }
        }
      },
    };
  },
};
