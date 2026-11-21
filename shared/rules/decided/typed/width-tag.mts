import type { FlowNode } from './decided-types.mts';

export function withWidth(
  node: FlowNode,
  { bits, signed }: { readonly bits: number; readonly signed: boolean },
): FlowNode {
  return Object.defineProperty({ ...node, bits }, 'signed', {
    value: signed,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
