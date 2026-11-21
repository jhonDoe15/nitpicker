import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isEffectCallback } from '../react-effects.mts';
import { leakedResources } from './effect-resources.mts';
import { endlessFrameLoops } from './frame-loops.mts';

type MessageId = 'neverClosed' | 'endlessFrameLoop';

const APP_MOUNT =
  /\b(?:createRoot|hydrateRoot)\s*\(|\bReactDOM\.render\s*\(|\bregisterComponent\s*\(/u;

function runsOnce(call: TSESTree.CallExpression): boolean {
  const [, dependencies] = call.arguments;
  return (
    dependencies?.type === AST_NODE_TYPES.ArrayExpression && dependencies.elements.length === 0
  );
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require effects to close the sockets, workers, observers and loops they open',
    },
    schema: [],
    messages: {
      neverClosed:
        '`{{resource}}` is opened in this effect and never closed: it stays open after the component unmounts and keeps calling into a component that is gone, and every further run of the effect opens another one. Keep the handle and return a cleanup that calls `{{close}}`. An exception fits only when the resource closes itself or must outlive the component.',
      endlessFrameLoop:
        'This `requestAnimationFrame` loop schedules itself again on every frame and nothing in the effect cancels it, so it keeps running after the component unmounts. Keep the frame id and return a cleanup that calls `cancelAnimationFrame(id)`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const mountsApp = APP_MOUNT.test(sourceCode.text);
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const [effect] = node.arguments;
        if (
          effect === undefined ||
          !isEffectCallback(sourceCode, effect) ||
          effect.body.type !== AST_NODE_TYPES.BlockStatement ||
          (mountsApp && runsOnce(node))
        ) {
          return;
        }
        for (const { node: opened, resource, close } of leakedResources(sourceCode, effect.body)) {
          context.report({ node: opened, messageId: 'neverClosed', data: { resource, close } });
        }
        for (const started of endlessFrameLoops(sourceCode, effect)) {
          context.report({ node: started, messageId: 'endlessFrameLoop' });
        }
      },
    };
  },
};
