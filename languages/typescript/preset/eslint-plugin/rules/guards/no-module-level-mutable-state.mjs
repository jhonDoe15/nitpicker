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

function isMutatedBy(identifier) {
  const member = outermostMember(identifier);
  const { parent } = member;
  if (member === identifier) {
    return (
      parent.type === 'CallExpression' &&
      parent.arguments[0] === identifier &&
      parent.callee.type === 'MemberExpression' &&
      parent.callee.object.name === 'Object' &&
      parent.callee.property.name === 'assign'
    );
  }
  const mutatingCall =
    parent.type === 'CallExpression' &&
    parent.callee === member &&
    MUTATING_METHODS.has(member.property.name);
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

function isExportedCollection(declarator) {
  return (
    declarator.parent.parent.type === 'ExportNamedDeclaration' && isCollection(declarator.init)
  );
}

function stateReport(context, declarator) {
  if (isExportedCollection(declarator)) {
    return 'exportedState';
  }
  const variable = context.sourceCode.getDeclaredVariables(declarator).at(0);
  return variable?.references.some(({ identifier }) => isMutatedBy(identifier))
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
        "Module-level '{{name}}' is an exported mutable collection that any importer can change. Build it inside a function and return it, or create it in the composition root and pass it in. If it is a deliberate per-process singleton, add an exception for this rule in nitpicker.config.json.",
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
