import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode, type SourceContext } from '../../analysis/constant-resolution.mts';
import { forEachNode } from '../../analysis/node/wrapper-calls.mts';
import { isTestFile } from '../../analysis/test-files/test-file-path.mts';
import {
  innerLoopTestDependsOnOuter,
  isScanMethodCall,
  isUniqueOrLiteralIterable,
  lookupFromExpression,
  patternNames,
  scanDependsOnOuter,
  type LoopContext,
} from './scan-analysis.mts';

const ARRAY_ITERATORS = new Set(['forEach', 'map', 'filter']);

function isIndexedLoopElement(
  init: TSESTree.Expression,
  iterableName: string | undefined,
  outerBindings: ReadonlySet<string>,
): boolean {
  return (
    iterableName !== undefined &&
    init.type === AST_NODE_TYPES.MemberExpression &&
    init.computed &&
    init.object.type === AST_NODE_TYPES.Identifier &&
    init.object.name === iterableName &&
    init.property.type === AST_NODE_TYPES.Identifier &&
    outerBindings.has(init.property.name)
  );
}

function recordLoopDeclaration(
  context: SourceContext,
  declarator: TSESTree.VariableDeclarator,
  { loop, iterableName }: { loop: LoopContext; iterableName: string | undefined },
): void {
  if (declarator.id.type !== AST_NODE_TYPES.Identifier || declarator.init === null) {
    return;
  }
  if (isIndexedLoopElement(declarator.init, iterableName, loop.outerBindings)) {
    loop.outerBindings.add(declarator.id.name);
    return;
  }
  const lookup = lookupFromExpression(context, declarator.init, loop);
  if (lookup !== undefined) {
    loop.lookupVars.set(declarator.id.name, lookup);
    return;
  }
  if (
    declarator.init.type === AST_NODE_TYPES.MemberExpression &&
    declarator.init.object.type === AST_NODE_TYPES.Identifier &&
    loop.outerBindings.has(declarator.init.object.name)
  ) {
    loop.keyVars.set(declarator.id.name, context.sourceCode.getText(declarator.init));
    loop.outerBindings.add(declarator.id.name);
  }
}

function buildLoopContext(
  context: SourceContext,
  body: TSESTree.Node,
  { initialBindings, iterableName }: { initialBindings: Set<string>; iterableName?: string },
): LoopContext {
  const loop: LoopContext = {
    body,
    outerBindings: new Set(initialBindings),
    keyVars: new Map(),
    lookupVars: new Map(),
  };
  forEachNode(context, body, (node) => {
    if (node.type === AST_NODE_TYPES.VariableDeclarator) {
      recordLoopDeclaration(context, node, { loop, iterableName });
    }
  });
  return loop;
}

function checkScanCall(
  context: Readonly<TSESLint.RuleContext<'repeatedScanPerKey', []>>,
  node: TSESTree.CallExpression,
  loop: LoopContext,
): void {
  if (!isScanMethodCall(node) || node.callee.type !== AST_NODE_TYPES.MemberExpression) {
    return;
  }
  const lookup = lookupFromExpression(context, node.callee.object, loop);
  const predicate = node.arguments[0];
  if (
    lookup === undefined ||
    predicate === undefined ||
    predicate.type === AST_NODE_TYPES.SpreadElement
  ) {
    return;
  }
  if (!scanDependsOnOuter(context, predicate, { loop, lookup })) {
    context.report({ node, messageId: 'repeatedScanPerKey' });
  }
}

function checkInnerForOf(
  context: Readonly<TSESLint.RuleContext<'repeatedScanPerKey', []>>,
  node: TSESTree.ForOfStatement,
  loop: LoopContext,
): void {
  const lookup = lookupFromExpression(context, node.right, loop);
  if (lookup === undefined) {
    return;
  }
  if (!innerLoopTestDependsOnOuter(context, node, { loop, lookup })) {
    context.report({ node, messageId: 'repeatedScanPerKey' });
  }
}

function inspectLoopBody(
  context: Readonly<TSESLint.RuleContext<'repeatedScanPerKey', []>>,
  body: TSESTree.Node,
  options: { initialBindings: Set<string>; iterableName?: string },
): void {
  const loop = buildLoopContext(context, body, options);
  forEachNode(context, body, (node) => {
    if (node.type === AST_NODE_TYPES.CallExpression) {
      checkScanCall(context, node, loop);
      return;
    }
    if (node.type === AST_NODE_TYPES.ForOfStatement) {
      checkInnerForOf(context, node, loop);
    }
  });
}

function forStatementIterable(node: TSESTree.ForStatement): TSESTree.Node | undefined {
  if (
    node.test?.type === AST_NODE_TYPES.BinaryExpression &&
    node.test.right.type === AST_NODE_TYPES.MemberExpression &&
    !node.test.right.computed &&
    node.test.right.property.type === AST_NODE_TYPES.Identifier &&
    node.test.right.property.name === 'length'
  ) {
    return node.test.right.object;
  }
  return undefined;
}

function forStatementBindings(node: TSESTree.ForStatement): Set<string> {
  if (node.init?.type !== AST_NODE_TYPES.VariableDeclaration) {
    return new Set();
  }
  return new Set(node.init.declarations.flatMap((declarator) => [...patternNames(declarator.id)]));
}

type RuleContext = Readonly<TSESLint.RuleContext<'repeatedScanPerKey', []>>;

function checkForOfLoop(context: RuleContext, node: TSESTree.ForOfStatement): void {
  if (isUniqueOrLiteralIterable(context, node.right)) {
    return;
  }
  const bindings =
    node.left.type === AST_NODE_TYPES.VariableDeclaration
      ? patternNames(node.left.declarations[0]?.id ?? node.left)
      : patternNames(node.left);
  if (bindings.size > 0) {
    inspectLoopBody(context, node.body, { initialBindings: bindings });
  }
}

function checkForLoop(context: RuleContext, node: TSESTree.ForStatement): void {
  const iterable = forStatementIterable(node);
  if (iterable === undefined || isUniqueOrLiteralIterable(context, iterable)) {
    return;
  }
  const bindings = forStatementBindings(node);
  const iterableName = iterable.type === AST_NODE_TYPES.Identifier ? iterable.name : undefined;
  if (bindings.size > 0) {
    inspectLoopBody(context, node.body, {
      initialBindings: bindings,
      ...(iterableName === undefined ? {} : { iterableName }),
    });
  }
}

function checkIteratorCall(context: RuleContext, node: TSESTree.CallExpression): void {
  if (
    node.callee.type !== AST_NODE_TYPES.MemberExpression ||
    node.callee.computed ||
    node.callee.property.type !== AST_NODE_TYPES.Identifier ||
    !ARRAY_ITERATORS.has(node.callee.property.name) ||
    isUniqueOrLiteralIterable(context, node.callee.object)
  ) {
    return;
  }
  const callback = node.arguments[0];
  if (!isFunctionNode(callback) || callback.params[0] === undefined) {
    return;
  }
  inspectLoopBody(context, callback.body, {
    initialBindings: patternNames(callback.params[0]),
  });
}

export const rule: TSESLint.RuleModule<'repeatedScanPerKey'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow rescanning a keyed collection for every loop element when the scan does not depend on the element',
    },
    schema: [],
    messages: {
      repeatedScanPerKey:
        'This scan over a keyed collection does not depend on the outer loop element, so every element sharing the same key repeats the exact same scan. Compute the scan result once per key (for example in a Map or Set) and reuse it.',
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    return {
      ForOfStatement(node) {
        checkForOfLoop(context, node);
      },
      ForStatement(node) {
        checkForLoop(context, node);
      },
      CallExpression(node) {
        checkIteratorCall(context, node);
      },
    };
  },
};
