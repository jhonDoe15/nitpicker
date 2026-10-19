const REPORT_METHODS = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'warning',
  'error',
  'fatal',
  'log',
  'verbose',
  'silly',
]);
const EMPTY_CONSTRUCTORS = new Set([
  'Array',
  'Object',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'String',
  'Number',
  'Boolean',
]);
const SCOPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassDeclaration',
  'ClassExpression',
]);
const FORMATTERS = new Set([
  'String',
  'Number',
  'Boolean',
  'toString',
  'stringify',
  'format',
  'join',
]);
const ALIAS_PASSES = 3;

function loggerName(name) {
  return (
    /^(?:console|log|logger|logging|pino|winston|bunyan)$/iu.test(name) || /Logger$/u.test(name)
  );
}

function receiverName(node) {
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  if (node.type === 'ThisExpression') {
    return 'this';
  }
  return undefined;
}

function isReport(node) {
  if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') {
    return false;
  }
  const { object, property, computed } = node.callee;
  if (computed || property.type !== 'Identifier') {
    return false;
  }
  const owner = receiverName(object);
  if (owner === 'console') {
    return true;
  }
  if (['stderr', 'stdout'].includes(owner) && property.name === 'write') {
    return true;
  }
  return REPORT_METHODS.has(property.name) && owner !== undefined && loggerName(owner);
}

function calleeName(node) {
  if (node.callee.type === 'Identifier') {
    return node.callee.name;
  }
  return node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier'
    ? node.callee.property.name
    : undefined;
}

function isEmptyValue(node) {
  const named = node.callee.type === 'Identifier' && EMPTY_CONSTRUCTORS.has(node.callee.name);
  const resolved =
    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === 'Promise' &&
    node.callee.property.name === 'resolve';
  return node.arguments.length === 0 && (named || resolved);
}

function within(outer, inner) {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}

export function createHandlerReader(sourceCode) {
  const { visitorKeys } = sourceCode;

  function* walk(root) {
    const pending = [root];
    for (const node of pending) {
      if (node !== root && (SCOPES.has(node.type) || isReport(node))) {
        continue;
      }
      yield node;
      for (const key of visitorKeys[node.type] ?? []) {
        const child = node[key];
        pending.push(...(Array.isArray(child) ? child : [child]).filter(Boolean));
      }
    }
  }

  function carries(node, variables) {
    return (
      node !== null &&
      variables.some((variable) =>
        variable.references.some((reference) => within(node, reference.identifier)),
      )
    );
  }

  function aliasesOf(handler, nodes, caught) {
    let variables = [...caught];
    for (let pass = 0; pass < ALIAS_PASSES; pass += 1) {
      for (const node of nodes) {
        if (node.type === 'VariableDeclarator' && carries(node.init, variables)) {
          variables = [...new Set([...variables, ...sourceCode.getDeclaredVariables(node)])];
        }
        if (
          node.type === 'AssignmentExpression' &&
          node.operator === '=' &&
          node.left.type === 'Identifier' &&
          carries(node.right, variables)
        ) {
          const target = sourceCode
            .getScope(node)
            .references.find((reference) => reference.identifier === node.left)?.resolved;
          if (target) variables = [...new Set([...variables, target])];
        }
      }
    }
    return variables;
  }

  function readOutside(variable, handler) {
    return variable.references.some(
      (reference) => reference.isRead() && !within(handler, reference.identifier),
    );
  }

  function assignmentEvidence(node, variables, handler) {
    if (!carries(node.right, variables)) {
      return false;
    }
    if (node.operator !== '=' || node.left.type !== 'Identifier') {
      return true;
    }
    const target = variables.find((variable) => variable.name === node.left.name);
    return target !== undefined && readOutside(target, handler);
  }

  function isEvidence(node, variables, handler) {
    switch (node.type) {
      case 'ThrowStatement':
        return true;
      case 'CallExpression':
      case 'NewExpression':
        return (
          !isEmptyValue(node) &&
          !FORMATTERS.has(calleeName(node)) &&
          node.arguments.some((argument) => carries(argument, variables))
        );
      case 'ReturnStatement':
        return (
          node.argument !== null &&
          (node.argument.type === 'ObjectExpression' || carries(node.argument, variables))
        );
      case 'AssignmentExpression':
        return assignmentEvidence(node, variables, handler);
      case 'VariableDeclarator':
        return false;
      default:
        return false;
    }
  }

  return function handles(handler) {
    const nodes = [...walk(handler.body)];
    const variables = aliasesOf(handler, nodes, sourceCode.getDeclaredVariables(handler));
    return nodes.some((node) => isEvidence(node, variables, handler));
  };
}
