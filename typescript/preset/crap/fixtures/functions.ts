export function simpleCovered(value: number): number {
  return value + 1;
}

export function complexCovered(value: number): number {
  if (value > 10) {
    return 1;
  }
  if (value > 5) {
    return 2;
  }
  return 3;
}

export function complexUncovered(value: number): number {
  if (value > 10) {
    return 1;
  }
  if (value > 5) {
    return 2;
  }
  return 3;
}

export function unknownCoverage(value: number): number {
  return value;
}
