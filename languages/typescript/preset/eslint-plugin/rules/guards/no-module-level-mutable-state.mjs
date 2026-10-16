import {
  compositionRootOptionsSchema,
  isCompositionRootFile,
} from '../boundaries/composition-root-files.mjs';

const COLLECTION_CONSTRUCTORS = new Set([
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
const CONTAINER_CONSTRUCTORS = new Set([...COLLECTION_CONSTRUCTORS, 'Array']);
const MUTATING_METHODS = new Set([
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
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);

function unwrap(expression) {
  const chain = [expression];
  for (const current of chain) {
    if (WRAPPERS.has(current.type)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function isObjectCreate(expression) {
  return (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    expression.callee.object.name === 'Object' &&
    expression.callee.property.name === 'create'
  );
}

function isConstructed(expression, constructors) {
  return (
    expression.type === 'NewExpression' &&
    expression.callee.type === 'Identifier' &&
    constructors.has(expression.callee.name)
  );
}

function isCollection(initializer) {
  const expression = unwrap(initializer);
  return isObjectCreate(expression) || isConstructed(expression, COLLECTION_CONSTRUCTORS);
}

function hasMutatingMethods(initializer) {
  const expression = unwrap(initializer);
  return expression.type === 'ArrayExpression' || isConstructed(expression, CONTAINER_CONSTRUCTORS);
}

function isContainer(initializer) {
  const expression = unwrap(initializer);
  if (expression.type === 'ArrayExpression' || expression.type === 'ObjectExpression') {
    return true;
  }
  return isObjectCreate(expression) || isConstructed(expression, CONTAINER_CONSTRUCTORS);
}

function outermostMember(identifier) {
  const chain = [identifier];
  for (const current of chain) {
    if (current.parent?.type === 'MemberExpression' && current.parent.object === current) {
      chain.push(current.parent);
    }
  }
  return chain.at(-1);
}

const MUTATING_STATICS = {
  Object: new Set(['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf']),
  Reflect: new Set(['set', 'defineProperty', 'deleteProperty', 'setPrototypeOf']),
};

function isMutatingStaticTarget(identifier) {
  const { parent } = identifier;
  const callee = parent.type === 'CallExpression' ? parent.callee : undefined;
  return (
    parent.arguments?.[0] === identifier &&
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    MUTATING_STATICS[callee.object.name]?.has(callee.property.name) === true
  );
}

function isMutatedBy(identifier, ownMethodsMutate) {
  const member = outermostMember(identifier);
  const { parent } = member;
  if (member === identifier) {
    return isMutatingStaticTarget(identifier);
  }
  const mutatingCall =
    parent.type === 'CallExpression' &&
    parent.callee === member &&
    MUTATING_METHODS.has(member.property.name) &&
    (ownMethodsMutate || member.object !== identifier);
  return (
    mutatingCall ||
    (parent.type === 'AssignmentExpression' && parent.left === member) ||
    parent.type === 'UpdateExpression' ||
    (parent.type === 'UnaryExpression' && parent.operator === 'delete')
  );
}

function moduleLevelConstants(program) {
  return program.body
    .map((statement) =>
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement,
    )
    .filter((statement) => statement?.type === 'VariableDeclaration' && statement.kind === 'const')
    .flatMap((statement) => statement.declarations)
    .filter(
      (declarator) =>
        declarator.id.type === 'Identifier' && declarator.init && isContainer(declarator.init),
    );
}

const READONLY_TYPES = new Set(['ReadonlyMap', 'ReadonlySet', 'ReadonlyArray']);

function isReadonlyAnnotation(declarator) {
  const annotation = declarator.id.typeAnnotation?.typeAnnotation;
  if (annotation?.type === 'TSTypeOperator') {
    return annotation.operator === 'readonly';
  }
  return (
    annotation?.type === 'TSTypeReference' &&
    annotation.typeName.type === 'Identifier' &&
    READONLY_TYPES.has(annotation.typeName.name)
  );
}

function isExportedCollection(declarator) {
  return (
    declarator.parent.parent.type === 'ExportNamedDeclaration' &&
    isCollection(declarator.init) &&
    !isReadonlyAnnotation(declarator)
  );
}

function aliasDeclarator(identifier) {
  const { parent } = identifier;
  return parent.type === 'VariableDeclarator' &&
    parent.init === identifier &&
    parent.id.type === 'Identifier' &&
    parent.parent.kind === 'const'
    ? parent
    : undefined;
}

function referencesWithAliases(context, declarator) {
  const variables = [...context.sourceCode.getDeclaredVariables(declarator)];
  const identifiers = [];
  for (const variable of variables) {
    const reads = variable.references.map(({ identifier }) => identifier);
    identifiers.push(...reads);
    const aliases = reads.map(aliasDeclarator).filter((alias) => alias !== undefined);
    variables.push(...aliases.flatMap((alias) => context.sourceCode.getDeclaredVariables(alias)));
  }
  return identifiers;
}

function stateReport(context, declarator) {
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

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow module-level collections and objects that the module mutates' },
    schema: compositionRootOptionsSchema,
    messages: {
      moduleState:
        "Module-level '{{name}}' is mutated, which is hidden shared state. Build a lookup table inside a function and return it, create shared state in the composition root and pass it in, or return a new value instead of mutating. If it is a deliberate per-process singleton, add an exception for this rule in nitpicker.config.json.",
      exportedState:
        "Module-level '{{name}}' is an exported mutable collection that any importer can change. If importers only read it, annotate it with a readonly type (`ReadonlySet<T>`, `ReadonlyMap<K, V>`, `readonly number[]`); otherwise build it inside a function and return it, or create it in the composition root and pass it in. If it is a deliberate per-process singleton, add an exception for this rule in nitpicker.config.json.",
    },
  },
  create(context) {
    if (isCompositionRootFile(context)) {
      return {};
    }
    return {
      'Program:exit'(program) {
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
