import { compositionRootOptionsSchema, isCompositionRootFile } from '../composition-root-files.mjs';

const CONTAINER_CONSTRUCTORS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet', 'Array']);
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
  return WRAPPERS.has(expression.type) ? unwrap(expression.expression) : expression;
}

function isContainer(initializer) {
  const expression = unwrap(initializer);
  if (expression.type === 'ArrayExpression' || expression.type === 'ObjectExpression') {
    return true;
  }
  return (
    expression.type === 'NewExpression' &&
    expression.callee.type === 'Identifier' &&
    CONTAINER_CONSTRUCTORS.has(expression.callee.name)
  );
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
  const callee = identifier.parent;
  const mutatingCall =
    parent.type === 'CallExpression' &&
    parent.callee === member &&
    callee.type === 'MemberExpression' &&
    MUTATING_METHODS.has(callee.property.name);
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

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow module-level collections and objects that the module mutates' },
    schema: compositionRootOptionsSchema,
    messages: {
      moduleState:
        "Module-level '{{name}}' is mutated, which is hidden shared state. Create it in the composition root and pass it in as a parameter, or return a new value instead of mutating. If it is a deliberate per-process singleton, add an exception for this rule in nitpicker.config.json.",
    },
  },
  create(context) {
    if (isCompositionRootFile(context)) {
      return {};
    }
    return {
      'Program:exit'(program) {
        for (const declarator of moduleLevelConstants(program)) {
          const variable = context.sourceCode.getDeclaredVariables(declarator).at(0);
          if (variable?.references.some(({ identifier }) => isMutatedBy(identifier))) {
            context.report({
              node: declarator.id,
              messageId: 'moduleState',
              data: { name: declarator.id.name },
            });
          }
        }
      },
    };
  },
};
