import { entityKeys, fieldKey } from './names.mjs';

export function makeFact({
  kind,
  entityNames,
  fieldNames,
  label,
  file,
  line,
  style,
  width,
  bounds,
}) {
  return {
    kind,
    entities: entityKeys(...entityNames),
    fields: [...new Set(fieldNames.filter(Boolean).map(fieldKey))],
    label,
    file,
    line,
    style,
    width,
    bounds,
  };
}
