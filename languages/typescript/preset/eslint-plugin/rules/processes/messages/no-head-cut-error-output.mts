import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../../analysis/constant-resolution.mts';
import { chainOf, depthFirst, nameOf, nodeChildren } from '../../typed/node-views.mts';
import { enclosingFunction } from '../../typed/syntax-views.mts';
import { textBase } from './text-base.mts';

const CUTS = new Set(['slice', 'substring', 'substr']);
const OUTPUT_NAME = /^(?:std(?:err|out)|errorOutput)$|(?:Stderr|Stdout|ErrorOutput)$/u;
const MEASURED_ENDS = new Set(['indexOf', 'lastIndexOf', 'search', 'findIndex', 'findLastIndex']);
const SHORT_CUT = 40;
const ERROR_CALLEE = /(?:^|[a-z])Error$|^(?:reject|fail)$/u;
const LOG_LEVELS = new Set(['error', 'fatal']);
const JOINS = new Set([
  AST_NODE_TYPES.TemplateLiteral,
  AST_NODE_TYPES.BinaryExpression,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.ChainExpression,
]);

function isOutputText(node: TSESTree.Node): boolean {
  const base = textBase(node);
  const name =
    base.type === AST_NODE_TYPES.MemberExpression && !base.computed
      ? nameOf(base.property)
      : nameOf(base);
  return name !== undefined && OUTPUT_NAME.test(name);
}

function calleeName(callee: TSESTree.Node): string | undefined {
  return callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.property) : nameOf(callee);
}

function headCut(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const { callee } = node;
  const [start, end] = node.arguments;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    CUTS.has(nameOf(callee.property) ?? '') &&
    node.arguments.length === 2 &&
    start?.type === AST_NODE_TYPES.Literal &&
    start.value === 0 &&
    end?.type !== AST_NODE_TYPES.UnaryExpression &&
    end?.type !== AST_NODE_TYPES.SpreadElement &&
    !(
      end?.type === AST_NODE_TYPES.Literal &&
      typeof end.value === 'number' &&
      end.value < SHORT_CUT
    ) &&
    !(end?.type === AST_NODE_TYPES.BinaryExpression && end.operator === '-') &&
    !(
      end?.type === AST_NODE_TYPES.CallExpression && MEASURED_ENDS.has(calleeName(end.callee) ?? '')
    )
    ? callee.object
    : undefined;
}

function isSink(node: TSESTree.Node, value: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.ThrowStatement) {
    return true;
  }
  if (node.type !== AST_NODE_TYPES.NewExpression && node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const name = calleeName(node.callee) ?? '';
  const level = node.callee.type === AST_NODE_TYPES.MemberExpression && LOG_LEVELS.has(name);
  return (
    node.arguments.some((argument) => argument === value) && (ERROR_CALLEE.test(name) || level)
  );
}

function sinkStep(value: TSESTree.Node): TSESTree.Node | undefined {
  const { parent } = value;
  if (parent === undefined || isSink(parent, value)) {
    return undefined;
  }
  if (
    parent.type === AST_NODE_TYPES.Property &&
    parent.parent.type === AST_NODE_TYPES.ObjectExpression
  ) {
    return parent.parent;
  }
  return JOINS.has(parent.type) ? parent : undefined;
}

function sinkOf(start: TSESTree.Node): TSESTree.Node | undefined {
  const last = chainOf(start, sinkStep).at(-1) ?? start;
  return last.parent !== undefined && isSink(last.parent, last) ? last.parent : undefined;
}

function heldSink(context: SourceContext, cut: TSESTree.Node): TSESTree.Node | undefined {
  const { parent } = cut;
  if (
    parent?.type !== AST_NODE_TYPES.VariableDeclarator ||
    parent.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const variable = findVariable(context, parent.id, parent.id.name);
  return variable?.references
    .filter((reference) => reference.isRead())
    .map((reference) => sinkOf(reference.identifier))
    .find((sink) => sink !== undefined);
}

function keepsEnd(scope: TSESTree.Node): boolean {
  return [...depthFirst<TSESTree.Node>(scope, nodeChildren)].some(
    (node) =>
      node.type === AST_NODE_TYPES.CallExpression &&
      CUTS.has(calleeName(node.callee) ?? '') &&
      (node.arguments.length === 1 || node.arguments[0]?.type === AST_NODE_TYPES.UnaryExpression),
  );
}

export const rule: TSESLint.RuleModule<'headCut'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow keeping only the start of tool output in an error',
    },
    schema: [],
    messages: {
      headCut:
        'This keeps only the start of the output of a tool and puts it into an error. Build tools, compilers and test runners print the cause at the end (the failing task, the last "Caused by:", the summary), so the message keeps the banner and drops the reason. Keep the end (text.slice(-4000)), or the start and the end with a marker between them.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const text = headCut(node);
        if (text === undefined || !isOutputText(text)) {
          return;
        }
        const sink = sinkOf(node) ?? heldSink(context, node);
        if (sink !== undefined && !keepsEnd(enclosingFunction(node) ?? context.sourceCode.ast)) {
          context.report({ node, messageId: 'headCut' });
        }
      },
    };
  },
};
