export function onHoldParts(held: number): readonly string[] {
  return held === 0 ? [] : [`${String(held)} on hold`];
}
