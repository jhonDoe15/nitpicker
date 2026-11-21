import { THRESHOLDS } from './thresholds.mts';

export function partnerLimit(size: number): number {
  return size > THRESHOLDS.fullBucket ? THRESHOLDS.bucketNeighbours : size;
}
