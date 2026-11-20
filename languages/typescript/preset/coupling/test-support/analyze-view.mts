import type { DependencyGraph, GraphModule } from '../../dependency-graph/graph-types.mts';
import { sharedUsedByOneFeature } from '../shared-usage.mts';

export { analyzeCoupling, type CouplingOptions } from '../analyze.mts';
export { sharedUsedByOneFeature };

export type CouplingModule = GraphModule;

export type CouplingGraph = DependencyGraph;

export type SharedUsage = typeof sharedUsedByOneFeature;
