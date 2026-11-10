/** Orders strings by UTF-16 code unit, the order `Array.prototype.sort` gives without a comparator. */
export function byText(left, right) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
