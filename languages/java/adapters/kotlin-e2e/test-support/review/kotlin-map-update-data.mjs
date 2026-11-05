import { readFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = 'src/main/kotlin/demo/orders/InFlight.kt';
const PROJECT = path.resolve(import.meta.dirname, '../../../fixtures/kotlin-map-update-project');

export const MAP_UPDATE_FILES = {
  [SOURCE]: readFileSync(path.join(PROJECT, SOURCE), 'utf8'),
};

export const MAP_UPDATE_FINDINGS = [
  'RecursiveMapUpdate direct.counts',
  'RecursiveMapUpdate getOrPutConcurrent.inProgress',
  'RecursiveMapUpdate helper.inProgress',
  'RecursiveMapUpdate indexed.counts',
  'RecursiveMapUpdate local.cache',
  'RecursiveMapUpdate minus.counts',
  'RecursiveMapUpdate nested.inProgress',
  'RecursiveMapUpdate reference.inProgress',
  'RecursiveMapUpdate views.counts',
];
