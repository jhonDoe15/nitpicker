type Expression = { kind: string; left?: Expression; right?: Expression; lhs?: Expression; rhs?: Expression; operator: string; value: number };
declare function apply(...values: unknown[]): number;

export function evaluate(node: Expression): number {
  if (node.kind === "binary") {
    return apply(node.operator, evaluate(node.left!), evaluate(node.right as Expression));
  }
  return node.value;
}

export const size = (node: Expression): number => (node.kind === "binary" ? size(node.left!) + size(node.right!) : 1);

export class Printer {
  print(node: Expression): string {
    return node.left ? this.print(node.left) + node.operator + this.print(node.right!) : String(node.value);
  }

  #walk(expr: Expression): number {
    return expr.lhs ? this.#walk(expr.lhs) + this.#walk(expr.rhs!) : 1;
  }
}

export function bounded(node: Expression, depth: number): number {
  if (depth > 100) {
    throw new Error("too deep");
  }
  return node.operator ? bounded(node.left!, depth + 1) + bounded(node.right!, depth + 1) : node.value;
}

export function shadowedOperands(node: Expression): number {
  return [node].map((node) => shadowedOperands(node.left!) + shadowedOperands(node.right!) + node.operator.length)[0];
}

export function twice(node: Expression): number {
  return node.operator ? twice(node.left!) : 0;
}

export function twice(node: Expression, other?: Expression): number {
  return node.operator ? twice(node.left!) + twice(node.right!) : 0;
}

export function binaryTry(node: Expression): number {
  try {
    return binaryTry(node.right!);
  } catch {
    return binaryTry(node.left!);
  } finally {
    binaryTry(node.left!);
  }
}
