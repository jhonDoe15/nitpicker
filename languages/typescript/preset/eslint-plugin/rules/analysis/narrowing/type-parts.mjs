export function partsOf(type) {
  return type.isUnion() ? type.types : [type];
}
