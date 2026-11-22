import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { memberName, outerOf, someNode } from '../../collections/costly-forms/repeated-runs.mts';
import { contains, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { readsName } from '../early-exits/early-guards.mts';
import { isFsRead } from '../early-exits/pure-work.mts';
import { isFsCall } from '../repeated-calls/call-shapes.mts';
import { isRepeatedRelativeTo } from '../support/ast-walk.mts';
import { pushLoopFiller, readAllInit } from './filled-lists.mts';

function singlePass(use: TSESTree.Node): TSESTree.Node | undefined {
  const outer = outerOf(use);
  const { parent } = outer;
  if (parent?.type === AST_NODE_TYPES.ForOfStatement && parent.right === outer) {
    return parent.body;
  }
  if (parent?.type !== AST_NODE_TYPES.MemberExpression || parent.object !== outer) {
    return undefined;
  }
  const call = outerOf(parent).parent;
  return call?.type === AST_NODE_TYPES.CallExpression &&
    call.parent.type === AST_NODE_TYPES.ExpressionStatement &&
    memberName(parent) === 'forEach' &&
    call.arguments.length === 1
    ? call.arguments[0]
    : undefined;
}

const WRITES = /^(?:append|copy|cp|move|mv|output|remove|rename|rm|truncate|unlink|write)/u;

function writesFiles(sourceCode: SourceCode, pass: TSESTree.Node): boolean {
  return someNode(pass, (node) => {
    if (node.type !== AST_NODE_TYPES.CallExpression) {
      return false;
    }
    const callee = unwrapped(node.callee);
    const name = callee.type === AST_NODE_TYPES.Identifier ? callee.name : memberName(callee);
    return (
      WRITES.test(name ?? '') || (isFsCall(sourceCode, callee) && !isFsRead(sourceCode, callee))
    );
  });
}

export const rule: TSESLint.RuleModule<'readAll'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow reading every input into memory before a single pass over them',
    },
    schema: [],
    messages: {
      readAll:
        'Every input is read into `{{name}}` before the one pass over it, so all of them sit in memory at once and peak memory grows with the number of inputs. Read and handle one input at a time (read, handle and drop each in one loop), use a bounded pool for parallel reads, or keep only what the pass needs from each input.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      VariableDeclarator(declarator) {
        const { id, init, parent } = declarator;
        if (id.type !== AST_NODE_TYPES.Identifier || init === null || parent.kind !== 'const') {
          return;
        }
        const statements: readonly TSESTree.Node[] =
          'body' in parent.parent && Array.isArray(parent.parent.body) ? parent.parent.body : [];
        const initial = unwrapped(init);
        const filler =
          initial.type === AST_NODE_TYPES.ArrayExpression && initial.elements.length === 0
            ? pushLoopFiller(sourceCode, statements[statements.indexOf(parent) + 1], id.name)
            : undefined;
        if (filler === undefined && !readAllInit(sourceCode, init)) {
          return;
        }
        const uses = (variableNamed(sourceCode, id)?.references ?? []).filter(
          (reference) =>
            !reference.init && (filler === undefined || !contains(filler, reference.identifier)),
        );
        const [only] = uses;
        const pass =
          uses.length === 1 && only !== undefined ? singlePass(only.identifier) : undefined;
        if (
          pass !== undefined &&
          only !== undefined &&
          !readsName(pass, id.name) &&
          !writesFiles(sourceCode, pass) &&
          !isRepeatedRelativeTo(only.identifier, declarator)
        ) {
          context.report({ node: declarator, messageId: 'readAll', data: { name: id.name } });
        }
      },
    };
  },
};
