import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf } from '../../typed/node-views.mts';
import { isFunctionNode } from '../../lifecycles/scope/close-scopes.mts';
import {
  closesDescriptor,
  descriptorBindings,
  handleUse,
  inStreamOverride,
  isFileHandleOpen,
  isOpenSync,
  keepsOwnership,
  type DescriptorBindings,
} from './descriptor-calls.mts';

type MessageId = 'discarded' | 'neverClosed';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;

const FORM =
  ' An exception fits only a descriptor that must stay open for the life of the process.';

function reference(identifier: TSESTree.Node): boolean {
  const parent = identifier.parent;
  return !(parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.id === identifier);
}

function neverClosed(
  context: Context,
  declarator: TSESTree.VariableDeclarator,
  check: (identifier: TSESTree.Node) => 'close' | 'use' | 'other',
): boolean {
  const [variable] = context.sourceCode.getDeclaredVariables(declarator);
  if (variable === undefined) {
    return false;
  }
  const kinds = variable.references
    .map((each) => each.identifier as TSESTree.Node)
    .filter(reference)
    .map(check);
  return !kinds.includes('close') && !kinds.includes('other');
}

function declaratorOf(call: TSESTree.CallExpression): TSESTree.VariableDeclarator | undefined {
  const awaited = call.parent?.type === AST_NODE_TYPES.AwaitExpression ? call.parent : call;
  const declarator = awaited.parent;
  if (
    declarator?.type !== AST_NODE_TYPES.VariableDeclarator ||
    declarator.init !== awaited ||
    declarator.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const { kind } = declarator.parent;
  return kind === 'const' || kind === 'let' ? declarator : undefined;
}

function discarded(call: TSESTree.CallExpression): boolean {
  const parent = call.parent;
  const statement = parent?.type === AST_NODE_TYPES.AwaitExpression ? parent.parent : parent;
  return statement?.type === AST_NODE_TYPES.ExpressionStatement;
}

function insideFunction(node: TSESTree.Node): boolean {
  return ancestorsOf(node).some(isFunctionNode);
}

function descriptorCheck(bindings: DescriptorBindings) {
  return (identifier: TSESTree.Node): 'close' | 'use' | 'other' => {
    if (closesDescriptor(identifier, bindings)) {
      return 'close';
    }
    return keepsOwnership(identifier, bindings) && !inStreamOverride(identifier) ? 'use' : 'other';
  };
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a file descriptor or FileHandle from open to be closed' },
    schema: [],
    messages: {
      discarded: `The descriptor returned by this open call is dropped, so it stays open until the process exits and each call leaks one. To create or empty a file use writeFileSync(path, '') or await writeFile(path, ''); otherwise keep the descriptor and close it in finally.${FORM}`,
      neverClosed: `\`{{name}}\` is opened here and never closed in this function, so every call leaks a descriptor (and a descriptor handed to spawn as stdio stays open in the parent too). Close it in try { ... } finally { closeSync({{name}}); } (or await {{name}}.close()), or use await using for a FileHandle.${FORM}`,
    },
  },
  create(context) {
    const bindings = descriptorBindings(context.sourceCode.ast);
    return {
      CallExpression(call: TSESTree.CallExpression) {
        const sync = isOpenSync(call, bindings);
        if (!sync && !isFileHandleOpen(call, bindings)) {
          return;
        }
        if (discarded(call)) {
          context.report({ node: call, messageId: 'discarded' });
          return;
        }
        const declarator = declaratorOf(call);
        if (declarator === undefined || !insideFunction(declarator)) {
          return;
        }
        const check = sync ? descriptorCheck(bindings) : handleUse;
        if (neverClosed(context, declarator, check)) {
          context.report({
            node: call,
            messageId: 'neverClosed',
            data: {
              name: declarator.id.type === AST_NODE_TYPES.Identifier ? declarator.id.name : '',
            },
          });
        }
      },
    };
  },
};
