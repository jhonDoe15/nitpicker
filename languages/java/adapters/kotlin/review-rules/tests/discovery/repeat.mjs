export function repeatUntil(limit, step) {
  Array.from({ length: limit }).some(() => step());
}
