import { withLegacyInventory as untypedWithLegacyInventory } from '../../../../../shared/legacy-inventory.mts';
import { sourceInputs as untypedSourceInputs } from '../../../../../shared/input-sets/inputs.mts';
import type { PackageAnalyzer } from './analyzer-types.mts';

export const sourceInputs: (extensions: readonly string[]) => unknown = untypedSourceInputs;
export const withLegacyInventory: (
  analyzer: PackageAnalyzer,
  legacyInventory: string,
) => PackageAnalyzer = untypedWithLegacyInventory;
