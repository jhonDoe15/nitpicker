import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { typeServices } from '../security/security-values.mts';
import {
  dataListener,
  hasEncodingEvidence,
  isAny,
  isBinaryChunk,
  isStreamReceiver,
  streamLoop,
  typeNames,
  yieldsStrings,
  type Chunk,
  type Services,
} from './chunk-sources.mts';
import { usesOf } from './chunk-uses.mts';

type MessageId = 'collected' | 'decoded' | 'matched';

function judged(
  context: Readonly<TSESLint.RuleContext<MessageId, []>>,
  services: Services,
  chunk: Chunk,
): boolean {
  const { sourceCode } = context;
  const receiver = sourceCode.getText(chunk.receiver);
  if (
    sourceCode.text.includes(`${receiver}.setEncoding(`) ||
    yieldsStrings(sourceCode, chunk.receiver)
  ) {
    return false;
  }
  const identifier = chunk.variable.identifiers[0];
  if (identifier === undefined) {
    return false;
  }
  if (isBinaryChunk(services, identifier)) {
    return true;
  }
  return (
    isAny(services, identifier) &&
    isStreamReceiver(services, chunk.receiver) &&
    !hasEncodingEvidence(sourceCode.text)
  );
}

export const rule: TSESLint.RuleModule<MessageId, [], { readonly requiresTypeChecking: boolean }> =
  {
    meta: {
      type: 'problem',
      docs: {
        description: 'Report stream chunks that are decoded or matched one at a time',
        requiresTypeChecking: true,
      },
      schema: [],
      messages: {
        collected:
          '`{{target}}` collects stream chunks as text one at a time, so a multibyte character split across two chunks is corrupted. Keep the chunks (`parts.push(chunk)`) and decode once at the end (`Buffer.concat(parts).toString("utf8")`), or call `setEncoding("utf8")` on the stream first.',
        decoded:
          'This `decode` call decodes one chunk on its own, so a multibyte character split across two chunks is corrupted. Pass `{ stream: true }` as the second argument for every chunk and call `decode()` once more at the end, or collect the chunks and decode them together.',
        matched:
          '`{{method}}` looks for text inside a single chunk, so a match split across two chunks is missed. Append the chunk to an accumulated string or buffer and search that, or call `setEncoding("utf8")` and keep a rolling tail.',
      },
    },
    create(context) {
      const services = typeServices(context);
      if (services === undefined) {
        return {};
      }
      const { sourceCode } = context;
      const resolved: Services = {
        checker: services.program.getTypeChecker(),
        toTs: (node) => services.esTreeNodeToTSNodeMap.get(node),
      };
      function check(chunk: Chunk | undefined) {
        if (chunk === undefined || !judged(context, resolved, chunk)) {
          return;
        }
        const isDecoder = (receiver: TSESTree.Node) =>
          typeNames(resolved, receiver).includes('TextDecoder');
        for (const use of usesOf(sourceCode, chunk, isDecoder)) {
          const data =
            use.kind === 'collected'
              ? { target: use.target }
              : use.kind === 'matched'
                ? { method: use.method }
                : {};
          context.report({ node: use.node, messageId: use.kind, data });
        }
      }
      return {
        CallExpression(node) {
          check(dataListener(sourceCode, node));
        },
        ForOfStatement(node) {
          check(streamLoop(sourceCode, node));
        },
      };
    },
  };
