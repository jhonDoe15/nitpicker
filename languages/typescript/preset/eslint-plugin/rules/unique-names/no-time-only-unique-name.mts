import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant } from '../analysis/constant-resolution.mts';
import { nameOf } from '../typed/node-views.mts';
import { hasClock, isJoin, isTimeOnlyText, mentionsTmpdir } from './time-values.mts';

type MessageId = 'directory' | 'file' | 'id';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;

const DIRECTORY: MessageId = 'directory';

const WRITERS = new Set([
  'mkdir',
  'mkdirSync',
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'createWriteStream',
  'outputFile',
  'ensureDir',
]);
const ID_NAMES = new Set(['id', '_id', 'uid', 'key', 'name']);
const LABEL_NAMES = new Set(['key', 'name']);
const DATE_ONLY =
  /slice\(0,\s*10\)|substring\(0,\s*10\)|toDateString|toLocaleDateString|split\(.T.\)\[0\]/u;
const TEXT_FORMS = new Set<string>([
  AST_NODE_TYPES.TemplateLiteral,
  AST_NODE_TYPES.BinaryExpression,
  AST_NODE_TYPES.CallExpression,
]);

function calleeName(node: TSESTree.CallExpression): string {
  return (
    (node.callee.type === AST_NODE_TYPES.MemberExpression
      ? nameOf(node.callee.property)
      : nameOf(node.callee)) ?? ''
  );
}

function keyName(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.MemberExpression && !node.computed) {
    return nameOf(node.property);
  }
  return node.type === AST_NODE_TYPES.Identifier ? node.name : undefined;
}

function holderName(node: TSESTree.Node): string | undefined {
  const parent: TSESTree.Node | undefined = node.parent;
  if (parent === undefined) {
    return undefined;
  }
  if (parent.type === AST_NODE_TYPES.Property && parent.value === node && !parent.computed) {
    return nameOf(parent.key);
  }
  if (parent.type === AST_NODE_TYPES.AssignmentExpression && parent.right === node) {
    return keyName(parent.left);
  }
  return parent.type === AST_NODE_TYPES.VariableDeclarator && parent.init === node
    ? keyName(parent.id)
    : undefined;
}

function isIdName(name: string | undefined): boolean {
  return name !== undefined && ID_NAMES.has(name);
}

type Finding = {
  readonly context: Context;
  readonly reported: Set<TSESTree.Node>;
  readonly node: TSESTree.Node;
  readonly messageId: MessageId;
};

function reportOnce({ context, reported, node, messageId }: Finding) {
  if (!reported.has(node)) {
    reported.add(node);
    context.report({ node, messageId });
  }
}

function isTimeId(context: Context, node: TSESTree.Node): boolean {
  const name = holderName(node);
  if (name === undefined || !ID_NAMES.has(name) || !isTimeOnlyText(context, node)) {
    return false;
  }
  return !(LABEL_NAMES.has(name) && DATE_ONLY.test(context.sourceCode.getText(node)));
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report a temp directory, file name or record id made unique only by the current time',
    },
    schema: [],
    messages: {
      directory:
        'This temp path is unique only by the current time, so two calls in the same millisecond ' +
        'share one directory. Create it with `fs.mkdtemp(path.join(os.tmpdir(), "prefix-"))`.',
      file:
        'This file name is unique only by the current time, so two writes in the same ' +
        'millisecond share one file. Add a random part (`crypto.randomUUID()`) or use `mkdtemp`.',
      id:
        'This id is unique only by the current time, so two records made in the same ' +
        'millisecond share it. Use `crypto.randomUUID()` or add a unique part.',
    },
  },
  create(context) {
    const reported = new Set<TSESTree.Node>();
    function report(node: TSESTree.Node, messageId: MessageId): void {
      reportOnce({ context, reported, node, messageId });
    }
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const [first] = node.arguments;
        if (!isJoin(node) && isTimeId(context, node)) {
          report(node, 'id');
        } else if (isJoin(node) && node.arguments.some(mentionsTmpdir)) {
          if (isTimeOnlyText(context, node)) {
            report(node, DIRECTORY);
          }
        } else if (WRITERS.has(calleeName(node)) && first !== undefined) {
          const path = resolveConstant(context, first) ?? first;
          if (TEXT_FORMS.has(path.type) && isTimeOnlyText(context, path)) {
            report(path, 'file');
          }
        }
      },
      TemplateLiteral(node: TSESTree.TemplateLiteral) {
        if (mentionsTmpdir(node) && isTimeOnlyText(context, node) && !isJoin(node.parent)) {
          report(node, DIRECTORY);
        } else if (isTimeId(context, node)) {
          report(node, 'id');
        }
      },
      BinaryExpression(node: TSESTree.BinaryExpression) {
        if (node.parent.type === AST_NODE_TYPES.BinaryExpression) {
          return;
        }
        if (mentionsTmpdir(node) && isTimeOnlyText(context, node)) {
          report(node, DIRECTORY);
        } else if (isTimeId(context, node)) {
          report(node, 'id');
        }
      },
      LogicalExpression(node: TSESTree.LogicalExpression) {
        const { left, right } = node;
        const isFallback = node.operator === '||' || node.operator === '??';
        if (isFallback && isIdName(keyName(left)) && hasClock(context, right)) {
          report(node, 'id');
        }
      },
    };
  },
};
