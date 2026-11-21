import { entityKeys, fieldKey } from './names.mts';
import type { AnyBounds, Fact, FactKind } from '../fact-types.mts';

type FactParts = {
  readonly kind: FactKind;
  readonly entityNames: readonly (string | undefined)[];
  readonly fieldNames: readonly (string | undefined)[];
  readonly label: string;
  readonly file: string;
  readonly line: number;
  readonly style?: string | undefined;
  readonly width?: number | undefined;
  readonly bounds?: AnyBounds | undefined;
};

export function makeFact({
  kind,
  entityNames,
  fieldNames,
  label,
  file,
  line,
  style,
  width,
  bounds = {},
}: FactParts): Fact {
  return {
    kind,
    entities: entityKeys(...entityNames),
    fields: [
      ...new Set(
        fieldNames
          .filter((name): name is string => name !== undefined && name !== '')
          .map(fieldKey),
      ),
    ],
    label,
    file,
    line,
    style,
    width,
    bounds,
  };
}
