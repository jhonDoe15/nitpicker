import { makeFact } from '../scanning/facts.mts';
import { annotationBounds, combineBounds, hasBounds } from '../validators/bounds.mts';
import type { Fact, LocatedField } from '../fact-types.mts';

type FieldFactParts = {
  readonly entity: { readonly name: string };
  readonly field: LocatedField;
  readonly table: string | undefined;
  readonly style: string;
  readonly stored: boolean;
  readonly columnName?: string | undefined;
  readonly width: number | undefined;
  readonly enumerated: boolean;
};

export function fieldFacts({
  entity,
  field,
  table,
  style,
  stored,
  columnName,
  width,
  enumerated,
}: FieldFactParts): Fact[] {
  const names = {
    entityNames: [entity.name, table],
    fieldNames: [field.name, columnName],
    label: `${entity.name}.${field.name}`,
    file: field.file,
    line: field.line,
    style,
  };
  const bounds = combineBounds(
    field.annotations.map(({ name, args }) => annotationBounds(name, args, field.type)),
  );
  return [
    ...(enumerated ? [makeFact({ ...names, kind: 'enum' })] : []),
    ...(stored ? [makeFact({ ...names, kind: 'field' })] : []),
    ...(width === undefined ? [] : [makeFact({ ...names, kind: 'column', width })]),
    ...(hasBounds(bounds) ? [makeFact({ ...names, kind: 'validation', bounds })] : []),
  ];
}
