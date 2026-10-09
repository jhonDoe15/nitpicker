import {
  constantNumber,
  findVariable,
  importedCalleeName,
  moduleBindings,
} from './test-code-analysis.mjs';

/** Delays below this are short enough that a test waiting them out is not worth a rule. */
export const MIN_UNINJECTABLE_DELAY_MS = 500;

const TIMER_MODULES = new Set(['timers', 'node:timers', 'timers/promises', 'node:timers/promises']);
const TIMER_FUNCTIONS = new Set(['setTimeout', 'setInterval']);
// A parameter with one of these names can carry the delay, as can any destructured, defaulted or
// rest parameter: the rule only reports functions whose parameters clearly cannot.
const OPTION_PARAMETER_NAME =
  /option|opts|config|setting|delay|timeout|interval|wait|duration|ms$|param|override|dependenc|deps|context|ctx|env/i;
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function isFunction(node) {
  return FUNCTION_TYPES.has(node.type);
}

function exportedLocalNames(program) {
  const names = new Set();
  for (const statement of program.body) {
    if (
      statement.type === 'ExportNamedDeclaration' &&
      !statement.declaration &&
      !statement.source
    ) {
      for (const specifier of statement.specifiers) names.add(specifier.local.name);
    }
    if (
      statement.type === 'ExportDefaultDeclaration' &&
      statement.declaration.type === 'Identifier'
    ) {
      names.add(statement.declaration.name);
    }
  }
  return names;
}

/** The outermost function containing `node`, when it is a top-level declaration or const. */
function topLevelFunction(node) {
  let outermost;
  for (let current = node.parent; current && current.type !== 'Program'; current = current.parent) {
    if (isFunction(current)) outermost = current;
  }
  if (!outermost) return undefined;
  if (outermost.type === 'FunctionDeclaration') {
    return { fn: outermost, name: outermost.id?.name, host: outermost };
  }
  const declarator = outermost.parent;
  if (outermost.parent.type === 'ExportDefaultDeclaration') {
    return { fn: outermost, name: undefined, host: outermost };
  }
  const declaration = declarator.parent;
  if (
    declarator.type === 'VariableDeclarator' &&
    declarator.id.type === 'Identifier' &&
    declaration.type === 'VariableDeclaration' &&
    declaration.kind === 'const'
  ) {
    return { fn: outermost, name: declarator.id.name, host: declaration };
  }
  return undefined;
}

function isExported({ name, host }, exportedNames) {
  const wrapper = host.parent;
  if (wrapper.type === 'ExportNamedDeclaration' || wrapper.type === 'ExportDefaultDeclaration') {
    return true;
  }
  return name !== undefined && exportedNames.has(name);
}

function parameterCanCarryDelay(parameter) {
  if (parameter.type === 'Identifier') return OPTION_PARAMETER_NAME.test(parameter.name);
  return true;
}

function isModuleConstant(context, identifier) {
  const variable = findVariable(context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return (
    variable?.scope.type === 'module' &&
    definition?.type === 'Variable' &&
    definition.parent.kind === 'const'
  );
}

/** The module-level constant identifier a delay expression is built from, or undefined. */
function delayConstant(context, node) {
  if (node?.type === 'Identifier') return isModuleConstant(context, node) ? node : undefined;
  if (node?.type === 'BinaryExpression' && ['*', '+'].includes(node.operator)) {
    return delayConstant(context, node.left) ?? delayConstant(context, node.right);
  }
  return undefined;
}

function isGlobalTimer(context, callee) {
  if (callee.type === 'Identifier') {
    const variable = findVariable(context, callee, callee.name);
    return (
      TIMER_FUNCTIONS.has(callee.name) && (variable === undefined || variable.defs.length === 0)
    );
  }
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'globalThis' &&
    callee.property.type === 'Identifier' &&
    TIMER_FUNCTIONS.has(callee.property.name)
  );
}

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      uninjectableDelay: `{{timer}} waits {{name}} ({{value}} ms), a module constant that exported "{{owner}}" cannot override, so a test must wait it out or fake timers. Accept the delay as an option with {{name}} as its default, for example "{ delayMs = {{name}} } = {}". If the delay is deliberately fixed, add an exception for this rule in nitpicker.config.json.`,
    },
  },
  create(context) {
    const bindings = moduleBindings(context.sourceCode.ast, TIMER_MODULES);
    const exportedNames = exportedLocalNames(context.sourceCode.ast);
    function timerOf(node) {
      if (isGlobalTimer(context, node.callee))
        return { timer: node.callee.name ?? node.callee.property.name, delayIndex: 1 };
      const imported = importedCalleeName(node.callee, bindings);
      return TIMER_FUNCTIONS.has(imported) ? { timer: imported, delayIndex: 0 } : undefined;
    }
    return {
      CallExpression(node) {
        const timer = timerOf(node);
        if (!timer) return;
        const constant = delayConstant(context, node.arguments[timer.delayIndex]);
        const value = constant && constantNumber(context, node.arguments[timer.delayIndex]);
        if (value === undefined || value < MIN_UNINJECTABLE_DELAY_MS) return;
        const found = topLevelFunction(node);
        if (!found || !isExported(found, exportedNames)) return;
        if (found.fn.params.some(parameterCanCarryDelay)) return;
        context.report({
          node,
          messageId: 'uninjectableDelay',
          data: {
            timer: timer.timer,
            name: constant.name,
            value: String(value),
            owner: found.name ?? 'default',
          },
        });
      },
    };
  },
};
