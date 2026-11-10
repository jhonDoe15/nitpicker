import { readFileSync } from 'node:fs';
import path from 'node:path';

const SOURCES = path.resolve(
  import.meta.dirname,
  '../../../../fixtures/kotlin-map-update-project/src/main/kotlin/demo/orders',
);
const MAIN = 'src/main/kotlin/demo/orders';

export function mapUpdateFiles() {
  return {
    [`${MAIN}/InFlight.kt`]: readFileSync(path.join(SOURCES, 'InFlight.kt'), 'utf8'),
    [`${MAIN}/Batches.kt`]: readFileSync(path.join(SOURCES, 'Batches.kt'), 'utf8'),
  };
}

export const MAP_UPDATE_FINDINGS = [
  'RecursiveMapUpdate direct.counts',
  'RecursiveMapUpdate getOrPutConcurrent.inProgress',
  'RecursiveMapUpdate getOrPutDeclared.pending',
  'RecursiveMapUpdate helper.inProgress',
  'RecursiveMapUpdate indexed.counts',
  'RecursiveMapUpdate local.cache',
  'RecursiveMapUpdate minus.counts',
  'RecursiveMapUpdate nested.inProgress',
  'RecursiveMapUpdate outer.counts',
  'RecursiveMapUpdate outerThroughLabel.counts',
  'RecursiveMapUpdate reference.inProgress',
  'RecursiveMapUpdate views.counts',
];
