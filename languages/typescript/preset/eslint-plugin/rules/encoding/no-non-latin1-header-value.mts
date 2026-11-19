import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../analysis/constant-resolution.mts';
import { memberName, staticKey, unwrapped, type Context } from '../security/security-values.mts';
import { plainName } from './plain-names.mts';
import { concatOperands } from '../terminal/concat-operands.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';
import { valueKind } from './value-kinds.mts';
import { chainOf } from '../typed/node-views.mts';

type MessageId = 'encodeHeader';

const RECEIVER = /^(?:res|resp|response|reply|rep)$/iu;
const SET_METHODS = new Set(['setHeader', 'header', 'set', 'append', 'appendHeader']);
const RISKY_NAMES = new Set([
  'path',
  'pathname',
  'filepath',
  'filename',
  'relative',
  'relativepath',
  'route',
  'routepath',
  'username',
  'displayname',
  'fullname',
  'originalname',
]);
const REQUEST_ROOTS = new Set(['req', 'request']);
const REQUEST_PARTS = new Set(['params', 'query', 'body', 'cookies']);
const PATH_FUNCTIONS = new Set(['relative', 'resolve', 'join', 'dirname', 'basename']);

function memberChain(node: TSESTree.Node): TSESTree.Node[] {
  return chainOf<TSESTree.Node>(unwrapped(node), (current) =>
    current.type === AST_NODE_TYPES.MemberExpression ? unwrapped(current.object) : undefined,
  );
}

function isRequestData(node: TSESTree.Node): boolean {
  const chain = memberChain(node);
  const root = chain.at(-1);
  if (
    chain[0]?.type !== AST_NODE_TYPES.MemberExpression ||
    root?.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  return (
    REQUEST_ROOTS.has(root.name) &&
    chain.some(
      (current) =>
        current.type === AST_NODE_TYPES.MemberExpression &&
        REQUEST_PARTS.has(memberName(current) ?? ''),
    )
  );
}

function isCallOf(
  node: TSESTree.CallExpression,
  owner: string,
  names: ReadonlySet<string>,
): boolean {
  const callee = unwrapped(node.callee);
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === owner &&
    names.has(memberName(callee) ?? '')
  );
}

const DATA_NAME = /^(?:data|payload|serialized|json|state)$/iu;
const DATA_HEADER = /data|payload|path|state|file/iu;

function riskyOperands(plain: TSESTree.Node): readonly TSESTree.Node[] {
  const concatenated = concatOperands(plain);
  if (concatenated !== undefined) {
    return concatenated;
  }
  if (plain.type === AST_NODE_TYPES.ConditionalExpression) {
    return [plain.consequent, plain.alternate];
  }
  return plain.type === AST_NODE_TYPES.LogicalExpression ? [plain.left, plain.right] : [];
}

function isRiskyLeaf(plain: TSESTree.Node, header: string): boolean {
  if (plain.type === AST_NODE_TYPES.CallExpression) {
    return (
      isCallOf(plain, 'JSON', new Set(['stringify'])) || isCallOf(plain, 'path', PATH_FUNCTIONS)
    );
  }
  if (plain.type === AST_NODE_TYPES.Identifier || plain.type === AST_NODE_TYPES.MemberExpression) {
    return (
      RISKY_NAMES.has((plainName(plain) ?? '').toLowerCase()) ||
      isRequestData(plain) ||
      (DATA_HEADER.test(header) && DATA_NAME.test(plainName(plain) ?? ''))
    );
  }
  return false;
}

function isRiskyText(context: Context, node: TSESTree.Node, header = ''): boolean {
  const pending = [node];
  for (const item of pending) {
    const plain = unwrapped(item);
    const kind = valueKind(context, plain);
    if (kind === 'number' || kind === 'literals') {
      continue;
    }
    appendAll(pending, riskyOperands(plain));
    if (isRiskyLeaf(plain, header)) {
      return true;
    }
  }
  return false;
}

function headerValues(node: TSESTree.CallExpression): TSESTree.Node[] {
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return [];
  }
  const method = memberName(callee) ?? '';
  const receiver = plainName(callee.object) ?? '';
  const second = node.arguments[1];
  if (second === undefined || !SET_METHODS.has(method)) {
    return [];
  }
  const sets = method === 'setHeader' || method === 'appendHeader';
  return sets || RECEIVER.test(receiver) || /headers?$/iu.test(receiver) ? [second] : [];
}

function objectValues(node: TSESTree.ObjectExpression): TSESTree.Node[] {
  return node.properties.flatMap((property) =>
    property.type === AST_NODE_TYPES.Property ? [property.value] : [],
  );
}

const BRANCHES = new Set<string>([
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.LogicalExpression,
]);

function headerName(value: TSESTree.Node): string {
  const { parent } = value;
  if (parent?.type === AST_NODE_TYPES.Property) {
    return staticKey(parent) ?? '';
  }
  const [name] = parent?.type === AST_NODE_TYPES.CallExpression ? parent.arguments : [];
  return stringValue(name) ?? '';
}

function isRequestOptions(node: TSESTree.Node): boolean {
  const branches = chainOf<TSESTree.Node>(node, (current) =>
    current.parent !== undefined && BRANCHES.has(current.parent.type) ? current.parent : undefined,
  );
  const current = branches.at(-1) ?? node;
  const call = current.parent;
  return (
    call?.type === AST_NODE_TYPES.NewExpression ||
    (call?.type === AST_NODE_TYPES.CallExpression &&
      call.arguments.some((argument) => argument === current))
  );
}

function isHeadersProperty(node: TSESTree.Property): boolean {
  return (
    staticKey(node) === 'headers' &&
    node.value.type === AST_NODE_TYPES.ObjectExpression &&
    node.parent.type === AST_NODE_TYPES.ObjectExpression &&
    isRequestOptions(node.parent)
  );
}

function writtenHeaders(node: TSESTree.CallExpression | TSESTree.NewExpression): TSESTree.Node[] {
  const callee = unwrapped(node.callee);
  const named =
    node.type === AST_NODE_TYPES.NewExpression
      ? callee.type === AST_NODE_TYPES.Identifier && callee.name === 'Headers'
      : callee.type === AST_NODE_TYPES.MemberExpression && memberName(callee) === 'writeHead';
  const objects = node.arguments.filter(
    (argument) => argument.type === AST_NODE_TYPES.ObjectExpression,
  );
  return named ? objects.flatMap(objectValues) : [];
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow HTTP header values built from paths, user names or serialized data without encoding',
    },
    schema: [],
    messages: {
      encodeHeader:
        'Header values throw for a character above U+00FF, so a file path, route, user name or JSON with ' +
        'non-English text fails. Encode the value (`encodeURIComponent`, `encodeURI` or base64) and decode it ' +
        'on the other side.',
    },
  },
  create(context) {
    function check(values: readonly TSESTree.Node[]): void {
      for (const value of values) {
        if (isRiskyText(context, value, headerName(value))) {
          context.report({ node: value, messageId: 'encodeHeader' });
        }
      }
    }
    return {
      CallExpression(node) {
        check([...headerValues(node), ...writtenHeaders(node)]);
      },
      NewExpression(node) {
        check(writtenHeaders(node));
      },
      Property(node) {
        if (isHeadersProperty(node) && node.value.type === AST_NODE_TYPES.ObjectExpression) {
          check(objectValues(node.value));
        }
      },
    };
  },
};
