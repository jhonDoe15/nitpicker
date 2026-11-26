import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  calledMember,
  memberName,
  someNode,
} from '../../collections/costly-forms/repeated-runs.mts';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { isFunction, unwrapped, type FunctionNode } from '../../typed/syntax-views.mts';
import { isJsonParse } from '../read-all/input-reads.mts';

const PARSING_METHODS = new Set(['exec', 'match', 'matchAll', 'replace', 'replaceAll', 'split']);
const TEXT_METHODS = new Set([
  ...PARSING_METHODS,
  'at',
  'charAt',
  'endsWith',
  'filter',
  'flatMap',
  'includes',
  'indexOf',
  'join',
  'lastIndexOf',
  'map',
  'padEnd',
  'padStart',
  'slice',
  'startsWith',
  'substring',
  'test',
  'toLowerCase',
  'toUpperCase',
  'trim',
  'trimEnd',
  'trimStart',
]);
const { DefinitionType } = TSESLint.Scope;
const EFFECTS = new Set<string>([
  AST_NODE_TYPES.AssignmentExpression,
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.ThisExpression,
  AST_NODE_TYPES.UpdateExpression,
  AST_NODE_TYPES.YieldExpression,
]);

type Verdict = { readonly pure: boolean; readonly parses: boolean };

export function localFunction(
  sourceCode: SourceCode,
  callee: TSESTree.Node,
): FunctionNode | undefined {
  if (callee.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const definition = variableNamed(sourceCode, callee)?.defs[0];
  const node = definition?.node;
  if (node?.type === AST_NODE_TYPES.FunctionDeclaration) {
    return node;
  }
  return node?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.kind === 'const' &&
    node.init !== null &&
    isFunction(node.init)
    ? node.init
    : undefined;
}

function readsOuterState(sourceCode: SourceCode, fn: FunctionNode, node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = variableNamed(sourceCode, node);
  const definition = variable?.defs[0];
  if (definition === undefined) {
    return false;
  }
  const inside = fn.range[0] <= definition.name.range[0] && definition.name.range[1] <= fn.range[1];
  const fixed =
    definition.type === DefinitionType.FunctionName ||
    (definition.type === DefinitionType.Variable && definition.parent.kind === 'const');
  return !(inside || fixed);
}

type Step = {
  readonly pure: boolean;
  readonly parses: boolean;
  readonly local?: FunctionNode | undefined;
};

function callStep(sourceCode: SourceCode, call: TSESTree.CallExpression): Step {
  if (isJsonParse(sourceCode, unwrapped(call.callee))) {
    return { pure: true, parses: true };
  }
  const member = calledMember(call);
  if (member !== undefined) {
    const name = memberName(member) ?? '';
    return { pure: TEXT_METHODS.has(name), parses: PARSING_METHODS.has(name) };
  }
  const local = localFunction(sourceCode, call.callee);
  return { pure: local !== undefined, parses: false, local };
}

function bodySteps(sourceCode: SourceCode, fn: FunctionNode): Step[] {
  const steps: Step[] = [];
  someNode(fn.body, (node) => {
    if (EFFECTS.has(node.type) || readsOuterState(sourceCode, fn, node)) {
      steps.push({ pure: false, parses: false });
    } else if (node.type === AST_NODE_TYPES.CallExpression) {
      steps.push(callStep(sourceCode, node));
    }
    return false;
  });
  return steps;
}

export function parserVerdict(sourceCode: SourceCode, fn: FunctionNode): Verdict {
  const pending = [fn];
  const steps: Step[] = [];
  for (const current of pending) {
    const found = bodySteps(sourceCode, current);
    const locals = found
      .map((step) => step.local)
      .filter((local): local is FunctionNode => local !== undefined && !pending.includes(local));
    steps.push(...found);
    pending.push(...new Set(locals));
  }
  const pure = steps.every((step) => step.pure);
  return { pure, parses: pure && steps.some((step) => step.parses) };
}
