import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../../analysis/constant-resolution.mts';
import {
  constantNumber,
  findVariable,
  importedCalleeName,
  moduleBindings,
  moduleVariableKind,
} from '../../analysis/test-code-analysis.mts';
import { ancestorsOf, depthFirst } from '../../typed/node-views.mts';

type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
type TopLevel = {
  readonly fn: FunctionNode;
  readonly name: string | undefined;
  readonly host: FunctionNode | TSESTree.VariableDeclaration;
};
type GlobalTimer = TSESTree.Identifier | TSESTree.MemberExpressionNonComputedName;

const MIN_UNINJECTABLE_DELAY_MS = 500;

const TIMER_MODULES = new Set(['timers', 'node:timers', 'timers/promises', 'node:timers/promises']);
const TIMER_FUNCTIONS = new Set(['setTimeout', 'setInterval']);
const OPTION_PARAMETER_NAME =
  /option|opts|config|setting|delay|timeout|interval|wait|duration|ms$|param|override|dependenc|deps|context|ctx|env/i;
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function isFunction(node: TSESTree.Node): node is FunctionNode {
  return FUNCTION_TYPES.has(node.type);
}

function exportedNamesOf(statement: TSESTree.ProgramStatement): string[] {
  if (
    statement.type === AST_NODE_TYPES.ExportNamedDeclaration &&
    statement.declaration === null &&
    statement.source === null
  ) {
    return statement.specifiers.map((specifier) => specifier.local.name);
  }
  if (
    statement.type === AST_NODE_TYPES.ExportDefaultDeclaration &&
    statement.declaration.type === AST_NODE_TYPES.Identifier
  ) {
    return [statement.declaration.name];
  }
  return [];
}

function exportedLocalNames(program: TSESTree.Program): Set<string> {
  return new Set(program.body.flatMap(exportedNamesOf));
}

function outermostFunction(node: TSESTree.Node): FunctionNode | undefined {
  let outermost: FunctionNode | undefined;
  for (const current of ancestorsOf(node).filter(
    (ancestor) => ancestor.type !== AST_NODE_TYPES.Program,
  )) {
    if (isFunction(current)) {
      outermost = current;
    }
  }
  return outermost;
}

function topLevelFunction(node: TSESTree.Node): TopLevel | undefined {
  const outermost = outermostFunction(node);
  if (outermost === undefined) {
    return undefined;
  }
  if (outermost.type === AST_NODE_TYPES.FunctionDeclaration) {
    return { fn: outermost, name: outermost.id?.name, host: outermost };
  }
  const declarator = outermost.parent;
  if (outermost.parent.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
    return { fn: outermost, name: undefined, host: outermost };
  }
  if (
    declarator.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.id.type === AST_NODE_TYPES.Identifier
  ) {
    const declaration = declarator.parent;
    if (declaration.kind === 'const') {
      return { fn: outermost, name: declarator.id.name, host: declaration };
    }
  }
  return undefined;
}

function isExported({ name, host }: TopLevel, exportedNames: ReadonlySet<string>): boolean {
  const wrapper = host.parent;
  if (
    wrapper.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    wrapper.type === AST_NODE_TYPES.ExportDefaultDeclaration
  ) {
    return true;
  }
  return name !== undefined && exportedNames.has(name);
}

function parameterCanCarryDelay(parameter: TSESTree.Parameter): boolean {
  if (parameter.type === AST_NODE_TYPES.Identifier) {
    return OPTION_PARAMETER_NAME.test(parameter.name);
  }
  return true;
}

function isModuleConstant(context: SourceContext, identifier: TSESTree.Identifier): boolean {
  return moduleVariableKind(context, identifier) === 'const';
}

function delayOperands(node: TSESTree.Node | undefined): (TSESTree.Node | undefined)[] {
  return node?.type === AST_NODE_TYPES.BinaryExpression && ['*', '+'].includes(node.operator)
    ? [node.left, node.right]
    : [];
}

function delayConstant(
  context: SourceContext,
  node: TSESTree.Node | undefined,
): TSESTree.Identifier | undefined {
  for (const current of depthFirst<TSESTree.Node | undefined>(node, delayOperands)) {
    if (current?.type === AST_NODE_TYPES.Identifier && isModuleConstant(context, current)) {
      return current;
    }
  }
  return undefined;
}

function isGlobalTimer(context: SourceContext, callee: TSESTree.Node): callee is GlobalTimer {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    const variable = findVariable(context, callee, callee.name);
    return (
      TIMER_FUNCTIONS.has(callee.name) && (variable === undefined || variable.defs.length === 0)
    );
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'globalThis' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    TIMER_FUNCTIONS.has(callee.property.name)
  );
}

type TimerScope = {
  readonly context: SourceContext;
  readonly bindings: ReturnType<typeof moduleBindings>;
};

function timerOf(
  { context, bindings }: TimerScope,
  node: TSESTree.CallExpression,
): { readonly timer: string; readonly delayIndex: number } | undefined {
  const { callee } = node;
  if (isGlobalTimer(context, callee)) {
    const timer = callee.type === AST_NODE_TYPES.Identifier ? callee.name : callee.property.name;
    return { timer, delayIndex: 1 };
  }
  const imported = importedCalleeName(callee, bindings);
  return imported !== undefined && TIMER_FUNCTIONS.has(imported)
    ? { timer: imported, delayIndex: 0 }
    : undefined;
}

export const rule: TSESLint.RuleModule<'uninjectableDelay'> = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      uninjectableDelay: `{{timer}} waits {{name}} ({{value}} ms), a module constant that exported "{{owner}}" cannot override, so a test must wait it out or fake timers. Accept the delay as an option with {{name}} as its default, for example "{ delayMs = {{name}} } = {}". An exception fits only when the delay is deliberately fixed.`,
    },
  },
  create(context) {
    const bindings = moduleBindings(context.sourceCode.ast, TIMER_MODULES);
    const exportedNames = exportedLocalNames(context.sourceCode.ast);
    return {
      CallExpression(node) {
        const timer = timerOf({ context, bindings }, node);
        if (timer === undefined) {
          return;
        }
        const constant = delayConstant(context, node.arguments[timer.delayIndex]);
        if (constant === undefined) {
          return;
        }
        const value = constantNumber(context, node.arguments[timer.delayIndex]);
        if (value === undefined || value < MIN_UNINJECTABLE_DELAY_MS) {
          return;
        }
        const found = topLevelFunction(node);
        if (found === undefined || !isExported(found, exportedNames)) {
          return;
        }
        if (found.fn.params.some(parameterCanCarryDelay)) {
          return;
        }
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
