import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../analysis/constant-resolution.mts';
import { isEntryOfListedBase } from '../analysis/node/listed-entries.mts';
import { isPathBuilder } from '../analysis/node/listed-entry-sources.mts';
import {
  importedCalleeName,
  moduleBindings,
  type ModuleBindings,
} from '../analysis/subprocess-calls.mts';
import { depthFirst, nameOf, variableNamed, type SourceCode } from '../typed/node-views.mts';
import { CONTAINMENT_WRAPPERS, isContained } from './path-containment.mts';
import { unwrapOf } from '../typed/syntax-views.mts';

type Node = TSESTree.Node;
type Scope = {
  readonly context: SourceContext;
  readonly sourceCode: SourceCode;
  fs: ModuleBindings;
  pathModule: ModuleBindings;
};

const { DefinitionType } = TSESLint.Scope;

const JOINED_TEMPLATE_PARTS = 3;
const FS_MODULES = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']);
const PATH_MODULES = new Set(['path', 'node:path', 'path/posix', 'node:path/posix']);
const TWO_PATH_FUNCTIONS = new Set(
  ['rename', 'copyFile', 'cp', 'symlink', 'link'].flatMap((name) => [name, `${name}Sync`]),
);
const FS_FUNCTIONS = new Set(
  [
    'readFile',
    'writeFile',
    'appendFile',
    'readdir',
    'unlink',
    'rm',
    'rmdir',
    'stat',
    'lstat',
    'access',
    'exists',
    'mkdir',
    'open',
    'opendir',
    'readlink',
    'realpath',
    'truncate',
    'chmod',
    'chown',
    'utimes',
    'createReadStream',
  ]
    .flatMap((name) => [name, `${name}Sync`])
    .concat(['createWriteStream', 'watch', ...TWO_PATH_FUNCTIONS]),
);
const RESPONSE_SINKS = new Set(['sendFile']);
const PATH_BUILDERS = new Set(['join', 'resolve', 'normalize']);
const MAX_TAINT_STEPS = 50;

function boundValues(sourceCode: SourceCode, identifier: TSESTree.Identifier): Node[] {
  const variable = variableNamed(sourceCode, identifier);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (variable === undefined || definition?.type !== DefinitionType.Variable) {
    return [];
  }
  const writes = variable.references.flatMap((reference) => {
    const { writeExpr } = reference;
    return reference.isWrite() && writeExpr !== null && writeExpr !== undefined ? [writeExpr] : [];
  });
  const loop = definition.parent.parent;
  const iteration =
    loop.type === AST_NODE_TYPES.ForOfStatement && loop.left === definition.parent
      ? loop.right
      : undefined;
  const values = [definition.node.init, iteration, ...writes].flatMap((value) =>
    value === null || value === undefined ? [] : [value],
  );
  return [...new Set(values)];
}

function isParameter(sourceCode: SourceCode, identifier: TSESTree.Identifier): boolean {
  return (
    variableNamed(sourceCode, identifier)?.defs.some(
      ({ type }) => type === DefinitionType.Parameter,
    ) === true
  );
}

function callTaintSources(call: TSESTree.CallExpression, pathModule: ModuleBindings): Node[] {
  return importedCalleeName(call.callee, pathModule) === 'basename'
    ? []
    : [call.callee, ...call.arguments];
}

function operandSources(expression: Node): readonly Node[] {
  if (expression.type === AST_NODE_TYPES.MemberExpression) {
    return [expression.object];
  }
  if (expression.type === AST_NODE_TYPES.TemplateLiteral) {
    return expression.expressions;
  }
  if (
    expression.type === AST_NODE_TYPES.BinaryExpression ||
    expression.type === AST_NODE_TYPES.LogicalExpression
  ) {
    return [expression.left, expression.right];
  }
  if (expression.type === AST_NODE_TYPES.ConditionalExpression) {
    return [expression.consequent, expression.alternate];
  }
  return expression.type === AST_NODE_TYPES.SpreadElement ||
    expression.type === AST_NODE_TYPES.AwaitExpression
    ? [expression.argument]
    : [];
}

function taintSources(scope: Scope, expression: Node): readonly Node[] {
  const inner = unwrapOf(expression, CONTAINMENT_WRAPPERS);
  if (inner !== expression) {
    return [inner];
  }
  if (expression.type === AST_NODE_TYPES.Identifier) {
    return boundValues(scope.sourceCode, expression);
  }
  if (expression.type === AST_NODE_TYPES.CallExpression) {
    return callTaintSources(expression, scope.pathModule);
  }
  return operandSources(expression);
}

function isTainted(scope: Scope, expression: Node): boolean {
  const pending = [expression];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.Identifier && isParameter(scope.sourceCode, current)) {
      return true;
    }
    if (pending.length < MAX_TAINT_STEPS) {
      pending.push(...taintSources(scope, current));
    }
  }
  return false;
}

function isConcatenation(node: Node): node is TSESTree.BinaryExpression {
  return node.type === AST_NODE_TYPES.BinaryExpression && node.operator === '+';
}

function concatenationOperands(node: Node): Node[] {
  return isConcatenation(node) ? [node.left, node.right] : [];
}

function concatenated(expression: Node): Node[] {
  const leaves = [...depthFirst<Node>(expression, concatenationOperands)];
  return leaves.filter((node) => !isConcatenation(node));
}

function pathParts(scope: Scope, node: Node): readonly (Node | undefined)[] | undefined {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    const callee = importedCalleeName(node.callee, scope.pathModule);
    const builds = callee !== undefined && PATH_BUILDERS.has(callee);
    return builds ? node.arguments : undefined;
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    const startsWithText = node.quasis[0]?.value.cooked !== '';
    return startsWithText ? [undefined, ...node.expressions] : node.expressions;
  }
  return isConcatenation(node) ? concatenated(node) : undefined;
}

function isTaintedSegment(
  scope: Scope,
  base: Node | undefined,
  segment: Node | undefined,
): boolean {
  return (
    segment !== undefined && !isEntryOfListedBase(scope, base, segment) && isTainted(scope, segment)
  );
}

function listedEntryBase(
  scope: Scope,
  node: Node,
  parts: readonly (Node | undefined)[] | undefined,
): Node | undefined {
  const callee =
    node.type === AST_NODE_TYPES.CallExpression
      ? importedCalleeName(node.callee, scope.pathModule)
      : undefined;
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    parts?.length === 2 &&
    isPathBuilder(scope, node) &&
    callee !== undefined &&
    ['join', 'resolve'].includes(callee)
  ) {
    return parts[0];
  }
  const simpleTemplate =
    node.type === AST_NODE_TYPES.TemplateLiteral &&
    node.quasis.length === JOINED_TEMPLATE_PARTS &&
    node.quasis[0]?.value.cooked === '' &&
    node.quasis[1]?.value.cooked === '/' &&
    node.quasis[2]?.value.cooked === '';
  return simpleTemplate ? parts?.[0] : undefined;
}

function isUnsafeBuild(scope: Scope, expression: Node): boolean {
  const pending = [expression];
  for (const current of pending) {
    const node = unwrapOf(current, CONTAINMENT_WRAPPERS);
    const parts = node.type === AST_NODE_TYPES.Identifier ? undefined : pathParts(scope, node);
    if (
      parts
        ?.slice(1)
        .some((segment) => isTaintedSegment(scope, listedEntryBase(scope, node, parts), segment))
    ) {
      return true;
    }
    if (pending.length < MAX_TAINT_STEPS) {
      const next =
        node.type === AST_NODE_TYPES.Identifier ? boundValues(scope.sourceCode, node) : parts;
      pending.push(...(next ?? []).flatMap((item) => (item === undefined ? [] : [item])));
    }
  }
  return false;
}

function fsBindings(program: TSESTree.Program): ModuleBindings {
  const bindings = moduleBindings(program, FS_MODULES);
  for (const [local, imported] of bindings.named) {
    if (imported === 'promises') {
      bindings.namespaces.add(local);
    }
  }
  return bindings;
}

function sinkPaths(call: TSESTree.CallExpression, fs: ModuleBindings): Node[] {
  const name = importedCalleeName(call.callee, fs);
  if (name !== undefined && FS_FUNCTIONS.has(name)) {
    return call.arguments.slice(0, TWO_PATH_FUNCTIONS.has(name) ? 2 : 1);
  }
  const isResponseSink =
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    !call.callee.computed &&
    RESPONSE_SINKS.has(nameOf(call.callee.property) ?? '');
  return isResponseSink ? call.arguments.slice(0, 1) : [];
}

export const rule: TSESLint.RuleModule<'unsafePath'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a containment check when a file path is built from a parameter' },
    schema: [],
    messages: {
      unsafePath:
        "A path built from a parameter can leave the base directory with `../`. Resolve it into a variable and check containment on that variable in an `if` that returns or throws: `const full = path.resolve(base, name); if (!full.startsWith(base + path.sep)) { return { kind: 'outside-base' }; }`. An exception fits only when the parameter is a fixed file name.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    let fs: ModuleBindings = { named: new Map(), namespaces: new Set() };
    const scope: Scope = {
      context,
      sourceCode,
      fs,
      pathModule: { named: new Map(), namespaces: new Set() },
    };

    function isUnsafeSink(node: TSESTree.CallExpression, argument: Node): boolean {
      return isUnsafeBuild(scope, argument) && !isContained(scope, node, argument);
    }

    return {
      Program(node) {
        fs = fsBindings(node);
        scope.fs = fs;
        scope.pathModule = moduleBindings(node, PATH_MODULES);
      },
      CallExpression(node) {
        if (sinkPaths(node, fs).some((argument) => isUnsafeSink(node, argument))) {
          context.report({ node, messageId: 'unsafePath' });
        }
      },
    };
  },
};
