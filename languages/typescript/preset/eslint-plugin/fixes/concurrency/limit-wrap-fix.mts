import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../../rules/analysis/constant-resolution.mts';
import type { Context } from '../../rules/security/security-values.mts';
import { ancestorsOf } from '../../rules/typed/node-views.mts';
import { importingDefault } from '../edits/imports.mts';
import { freeName } from '../edits/names.mts';
import { allOf } from '../edits/plans.mts';
import {
  hasCommentIn,
  inserting,
  replacing,
  type FixPlan,
  type ReportFix,
} from '../support/ranges.mts';
import { isUnderDeadline } from './facts/deadline-guard.mts';
import { mapShape } from './facts/map-shape.mts';
import { isUsableDependency } from './facts/package-facts.mts';
import { FAN_OUT_LIMIT } from './p-map-fix.mts';

const MODULE = 'p-limit';
const DEFAULT_LOCAL = 'pLimit';
const ESM_ONLY_FROM = 4;

function statementOf(call: TSESTree.CallExpression): TSESTree.Node | undefined {
  for (const ancestor of ancestorsOf(call)) {
    if (isFunctionNode(ancestor)) {
      return undefined;
    }
    if (ancestor.parent?.type === AST_NODE_TYPES.BlockStatement) {
      return ancestor;
    }
  }
  return undefined;
}

function isInsideFunction(statement: TSESTree.Node): boolean {
  return ancestorsOf(statement).some(isFunctionNode);
}

function declaring(context: Context, statement: TSESTree.Node, text: string): FixPlan {
  const { sourceCode } = context;
  const lineStart = sourceCode.text.lastIndexOf('\n', statement.range[0] - 1) + 1;
  const indent = sourceCode.text.slice(lineStart, statement.range[0]);
  return /^[ \t]*$/u.test(indent)
    ? inserting(statement.range[0], `${text}\n${indent}`)
    : inserting(statement.range[0], `${text} `);
}

function wrappingBody(
  context: Context,
  callback: TSESTree.ArrowFunctionExpression,
  limiter: string,
): FixPlan | undefined {
  const { sourceCode } = context;
  const arrow = sourceCode.getTokenBefore(callback.body, {
    filter: (token) => token.value === '=>',
  });
  const start = arrow === null ? null : sourceCode.getTokenAfter(arrow);
  if (
    arrow === null ||
    start === null ||
    hasCommentIn(sourceCode, [arrow.range[0], start.range[0]])
  ) {
    return undefined;
  }
  const body = sourceCode.text.slice(start.range[0], callback.range[1]);
  const inner = callback.async ? 'async ' : '';
  return replacing([arrow.range[1], callback.range[1]], ` ${limiter}(${inner}() => ${body})`);
}

export function limitWrapFix(
  context: Context,
  call: TSESTree.CallExpression,
): ReportFix | undefined {
  const { sourceCode } = context;
  const shape = mapShape(call);
  const statement = statementOf(call);
  if (
    shape === undefined ||
    shape.callback.type !== AST_NODE_TYPES.ArrowFunctionExpression ||
    statement === undefined ||
    !isInsideFunction(statement) ||
    isUnderDeadline(context, call) ||
    !isUsableDependency(context, { name: MODULE, esmOnlyFrom: ESM_ONLY_FROM })
  ) {
    return undefined;
  }
  const edit = importingDefault(sourceCode, sourceCode.ast, {
    sources: [MODULE],
    name: DEFAULT_LOCAL,
    sites: [call],
  });
  const limiter = freeName(sourceCode, { sites: [call], within: call, base: 'limit' });
  if (edit === undefined || limiter === undefined) {
    return undefined;
  }
  const creation = `const ${limiter} = ${edit.local}(${String(FAN_OUT_LIMIT)});`;
  const body = wrappingBody(context, shape.callback, limiter);
  const plans = [
    edit.present ? undefined : edit.plan,
    declaring(context, statement, creation),
    body,
  ].filter((plan) => plan !== undefined);
  return body === undefined ? undefined : allOf(plans);
}
