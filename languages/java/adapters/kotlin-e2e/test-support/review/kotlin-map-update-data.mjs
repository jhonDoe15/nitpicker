import { readFileSync } from 'node:fs';
import path from 'node:path';

const SOURCES = [
  'src/main/kotlin/demo/orders/InFlight.kt',
  'src/main/kotlin/demo/orders/Batches.kt',
];
const PROJECT = path.resolve(import.meta.dirname, '../../../fixtures/kotlin-map-update-project');

export function mapUpdateFiles() {
  return Object.fromEntries(
    SOURCES.map((source) => [source, readFileSync(path.join(PROJECT, source), 'utf8')]),
  );
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
