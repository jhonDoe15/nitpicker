import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, stringValue, type SourceContext } from '../analysis/constant-resolution.mts';
import { ancestorsOf, depthFirst, nodeChildren } from '../typed/node-views.mts';
import { unwrapped } from '../typed/syntax-views.mts';

type MessageId = 'mismatch';
type Node = TSESTree.Node;

const ASSERTIONS = new Set(['assert', 'invariant']);
const SUBJECT = new RegExp(
  '^[`\'"]?([A-Za-z_$][\\w$]*)[`\'"]?\\s+' +
    "(?:must|should|is|are|was|cannot|can't|can not|may not|has|have|required|needs|not)\\b",
  'iu',
);

const HOOK_NAME = /^use[A-Z]/u;
const WORD_BREAK = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_\-\s]+/u;

function headWord(name: string): string {
  return (name.split(WORD_BREAK).at(-1) ?? '').toLowerCase().replace(/s$/u, '');
}

function normalized(name: string): string {
  return name.replaceAll(/[^a-z0-9]/giu, '').toLowerCase();
}

function operandNames(node: Node): string[] {
  const inner = unwrapped(node);
  if (inner.type === AST_NODE_TYPES.Identifier) {
    return [inner.name];
  }
  if (
    inner.type === AST_NODE_TYPES.MemberExpression &&
    inner.property.type === AST_NODE_TYPES.Identifier
  ) {
    return [...operandNames(inner.object), inner.property.name];
  }
  return inner.type === AST_NODE_TYPES.ThisExpression ? ['this'] : [];
}

function isNullLiteral(node: Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal && node.value === null && !('regex' in node)) ||
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined')
  );
}

function checkedOperand(test: Node): Node | undefined {
  const inner = unwrapped(test);
  if (inner.type === AST_NODE_TYPES.UnaryExpression && inner.operator === '!') {
    return inner.argument;
  }
  if (
    inner.type === AST_NODE_TYPES.BinaryExpression &&
    ['==', '===', '<=', '<'].includes(inner.operator)
  ) {
    return isNullLiteral(inner.right) ? inner.left : undefined;
  }
  return undefined;
}

function assertedOperand(test: Node): Node | undefined {
  const inner = unwrapped(test);
  if (inner.type === AST_NODE_TYPES.UnaryExpression && inner.operator === '!') {
    return undefined;
  }
  return operandNames(inner).length > 0 ? inner : undefined;
}

function messageOf(node: Node | undefined): string | undefined {
  return node === undefined ? undefined : stringValue(node);
}

function thrownMessage(statement: Node): string | undefined {
  const body = statement.type === AST_NODE_TYPES.BlockStatement ? statement.body : [statement];
  const [only] = body;
  if (body.length !== 1 || only?.type !== AST_NODE_TYPES.ThrowStatement) {
    return undefined;
  }
  const thrown = only.argument;
  return thrown.type === AST_NODE_TYPES.NewExpression ? messageOf(thrown.arguments[0]) : undefined;
}

function isMember(node: Node, name: string): boolean {
  return ancestorsOf(node).some(
    (each) =>
      each.type === AST_NODE_TYPES.ClassBody &&
      each.body.some(
        (member) =>
          'key' in member &&
          member.key.type === AST_NODE_TYPES.Identifier &&
          member.key.name === name,
      ),
  );
}

function isLocalValue(context: SourceContext, node: Node, name: string): boolean {
  const variable = findVariable(context, node, name);
  const definition = variable?.defs[0];
  return (
    definition !== undefined &&
    (definition.type === 'Parameter' ||
      (definition.type === 'Variable' && variable?.scope.variableScope.type === 'function'))
  );
}

function inScope(context: SourceContext, node: Node, name: string): boolean {
  return isLocalValue(context, node, name) || isMember(node, name);
}

function namedInScope(context: SourceContext, node: Node, message: string): string | undefined {
  const word = SUBJECT.exec(message.trim())?.[1];
  const candidates = word === undefined ? [] : [word, word.charAt(0).toLowerCase() + word.slice(1)];
  return candidates.find((name) => !HOOK_NAME.test(name) && inScope(context, node, name));
}

function mentions(root: Node | null | undefined, name: string): boolean {
  return (
    root !== null &&
    root !== undefined &&
    [...depthFirst<Node>(root, nodeChildren)].some(
      (node) => node.type === AST_NODE_TYPES.Identifier && node.name === name,
    )
  );
}

function isDerivedFrom(
  context: SourceContext,
  node: Node,
  pair: { checked: string; named: string },
): boolean {
  const definition = findVariable(context, node, pair.checked)?.defs[0];
  return definition?.type === 'Variable' && mentions(definition.node.init, pair.named);
}

function messageNames(message: string, names: readonly string[]): boolean {
  const words = new Set(message.split(/[^\w$]+/u).map((word) => normalized(word)));
  return names.some((name) => name !== 'this' && words.has(normalized(name)));
}

interface Precondition {
  report: Node;
  checked: Node | undefined;
  message: string | undefined;
  at: Node;
}

function mismatchData(
  context: SourceContext,
  { checked, message, at }: Precondition,
): { checked: string; named: string } | undefined {
  const names = checked === undefined ? [] : operandNames(checked);
  const named = message === undefined ? undefined : namedInScope(context, at, message);
  if (names.length === 0 || named === undefined || message === undefined) {
    return undefined;
  }
  const subject = names.find((name) => name !== 'this') ?? '';
  const redundant =
    messageNames(message, names) || isDerivedFrom(context, at, { checked: subject, named });
  const describing = names.some((name) => headWord(name) === headWord(named));
  const known = names.map(normalized).includes(normalized(named));
  return redundant || describing || known
    ? undefined
    : { checked: names.filter((name) => name !== 'this').join('.'), named };
}

function assertionName(callee: Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'assert' &&
    callee.property.name === 'ok'
    ? 'assert'
    : undefined;
}

export const rule: TSESLint.RuleModule<MessageId, []> = {
  meta: {
    type: 'problem',
    docs: { description: 'Name the checked value in a precondition message' },
    schema: [],
    messages: {
      mismatch:
        'The check is on `{{checked}}` but its message names `{{named}}`, so a failure points at the wrong value. ' +
        'Check `{{named}}`, or change the message to name `{{checked}}`.',
    },
  },
  create(context) {
    const verify = (precondition: Precondition) => {
      const data = mismatchData(context, precondition);
      if (data !== undefined) {
        context.report({ node: precondition.report, messageId: 'mismatch', data });
      }
    };

    return {
      IfStatement(node) {
        if (node.alternate === null) {
          const checked = checkedOperand(node.test);
          verify({ report: node, checked, message: thrownMessage(node.consequent), at: node });
        }
      },
      CallExpression(node) {
        const name = assertionName(unwrapped(node.callee));
        const [test, message] = node.arguments;
        if (name !== undefined && ASSERTIONS.has(name) && test !== undefined) {
          verify({
            report: node,
            checked: assertedOperand(test),
            message: messageOf(message),
            at: node,
          });
        }
      },
    };
  },
};
