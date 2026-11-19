import {
  MEMORY_ADVICE,
  heapDescription,
  heapMegabytesOf,
  isOutOfMemory,
  nodeHeapMegabytes,
  withNodeHeap,
} from '../../../../../shared/processes/memory/node-heap.mts';

export {
  heapMegabytesOf,
  isOutOfMemory,
  nodeHeapMegabytes as eslintHeapMegabytes,
  withNodeHeap as withEslintHeap,
};

export function outOfMemoryMessage(nodeOptions: string | undefined): string {
  return `ESLint ran out of memory (${heapDescription(nodeOptions)}). ${MEMORY_ADVICE}`;
}
