function transfer(source: string, target: string, amount: number): string {
  return `${source}->${target}:${String(amount)}`;
}

function between(left: number, right: number): number {
  return right - left;
}

export class Ledger {
  constructor(
    readonly source: string,
    readonly target: string,
  ) {}

  move(amount: number): string {
    return transfer(this.target, this.source, amount);
  }
}

export function moves(source: string, target: string, amount: number): readonly unknown[] {
  return [
    transfer(target, source, amount),
    transfer(source, target, amount),
    between(right(), left()),
    new Ledger(target, source),
    Math.max(target.length, source.length),
  ];
}

function right(): number {
  return 1;
}

function left(): number {
  return 0;
}
