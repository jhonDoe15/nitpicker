import { makeFact } from '../scanning/facts.mjs';
import { annotationBounds, combineBounds, hasBounds } from '../validators/bounds.mjs';

export function fieldFacts({
  entity,
  field,
  table,
  style,
  stored,
  columnName,
  width,
  enumerated = false,
}) {
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
